#!/usr/bin/env bash
# Exercita o fluxo de compra completo do marketplace inteiramente via api-gateway
# (registro -> login -> catalogo -> carrinho -> checkout -> pagamento assincrono),
# gerando trafego real que aparece nas metricas do Prometheus/Grafana.
#
# Uso:
#   ./e2e-flow.sh once                     - roda um ciclo e sai (exit code = sucesso/falha)
#   ./e2e-flow.sh loop                      - roda em loop ate Ctrl+C
#   ./e2e-flow.sh loop --interval 10        - loop com 10s entre ciclos (padrao: 5)
#   ./e2e-flow.sh loop --cycles 20          - loop limitado a 20 ciclos
#
# Variaveis de ambiente:
#   GATEWAY_URL   URL do api-gateway (padrao http://localhost:3005)
#   POOL_SIZE     quantos pares seller/buyer manter no pool (padrao 3)
#
# So faz login uma vez por usuario do pool (o JWT dura JWT_EXPIRES_IN=24h) e reaproveita
# o token nos ciclos seguintes, para nao esbarrar no rate limit de /auth/login (5/min).

set -uo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3005}"
# 1 par (2 registros) fica bem abaixo do rate limit de /auth/register (3/60s) e
# /auth/login (5/60s), então o setup do pool não fica esperando throttle na primeira
# execução. Aumente só se precisar de mais variedade de usuários — o tráfego gerado
# por ciclo (produtos/pedidos novos) já varia independente do tamanho do pool.
POOL_SIZE="${POOL_SIZE:-1}"
RUN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.run"
TAG_FILE="$RUN_DIR/e2e-flow-tag"

if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

STEP_OK=0
STEP_FAIL=0

info() { echo -e "${BLUE}==>${NC} $*"; }
ok()   { echo -e "  ${GREEN}ok${NC}   $*"; STEP_OK=$((STEP_OK + 1)); }
fail() { echo -e "  ${RED}FALHOU${NC} $*"; STEP_FAIL=$((STEP_FAIL + 1)); }

for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "comando '$bin' não encontrado no PATH" >&2; exit 1; }
done

mkdir -p "$RUN_DIR"
[[ -f "$TAG_FILE" ]] || echo "$RANDOM$RANDOM" >"$TAG_FILE"
TAG="$(cat "$TAG_FILE")"

# --- HTTP helper -------------------------------------------------------------
# Preenche HTTP_STATUS e HTTP_BODY a partir de uma chamada ao gateway.
api() {
  local method="$1" path="$2" token="${3:-}" data="${4:-}"
  local args=(-s -w '\n%{http_code}' -X "$method" "$GATEWAY_URL$path" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$data" ]] && args+=(-d "$data")
  local raw
  raw="$(curl "${args[@]}")"
  HTTP_BODY="${raw%$'\n'*}"
  HTTP_STATUS="${raw##*$'\n'}"
}

# repete uma chamada de auth (register/login) se vier 429 (throttle)
api_with_backoff() {
  local tries=4
  local i
  for ((i = 1; i <= tries; i++)); do
    api "$@"
    [[ "$HTTP_STATUS" != "429" ]] && return 0
    echo "  ...rate limit (429), aguardando 20s"
    sleep 20
  done
}

# --- pool de usuarios (registrado uma vez, reaproveitado entre execucoes) ----
declare -a SELLER_TOKEN BUYER_TOKEN

setup_pool() {
  info "Preparando pool de $POOL_SIZE seller(s)/buyer(s) (tag $TAG)"
  local i
  for ((i = 0; i < POOL_SIZE; i++)); do
    local seller_email="seller-$TAG-$i@example.com"
    local buyer_email="buyer-$TAG-$i@example.com"

    api_with_backoff POST /auth/register "" "$(jq -nc --arg e "$seller_email" \
      '{email:$e,password:"senha123",firstName:"Seller",lastName:($e),role:"seller"}')"
    [[ "$HTTP_STATUS" == "201" || "$HTTP_STATUS" == "409" ]] || fail "registro seller $i: HTTP $HTTP_STATUS $HTTP_BODY"

    api_with_backoff POST /auth/register "" "$(jq -nc --arg e "$buyer_email" \
      '{email:$e,password:"senha123",firstName:"Buyer",lastName:($e),role:"buyer"}')"
    [[ "$HTTP_STATUS" == "201" || "$HTTP_STATUS" == "409" ]] || fail "registro buyer $i: HTTP $HTTP_STATUS $HTTP_BODY"

    api_with_backoff POST /auth/login "" "$(jq -nc --arg e "$seller_email" '{email:$e,password:"senha123"}')"
    [[ "$HTTP_STATUS" == "200" ]] || { fail "login seller $i: HTTP $HTTP_STATUS $HTTP_BODY"; exit 1; }
    SELLER_TOKEN[$i]="$(echo "$HTTP_BODY" | jq -r '.token')"
    [[ "${SELLER_TOKEN[$i]}" != "null" && -n "${SELLER_TOKEN[$i]}" ]] || { fail "login seller $i: resposta sem campo 'token': $HTTP_BODY"; exit 1; }

    api_with_backoff POST /auth/login "" "$(jq -nc --arg e "$buyer_email" '{email:$e,password:"senha123"}')"
    [[ "$HTTP_STATUS" == "200" ]] || { fail "login buyer $i: HTTP $HTTP_STATUS $HTTP_BODY"; exit 1; }
    BUYER_TOKEN[$i]="$(echo "$HTTP_BODY" | jq -r '.token')"
    [[ "${BUYER_TOKEN[$i]}" != "null" && -n "${BUYER_TOKEN[$i]}" ]] || { fail "login buyer $i: resposta sem campo 'token': $HTTP_BODY"; exit 1; }
  done
  ok "pool pronto: $POOL_SIZE seller(s) e $POOL_SIZE buyer(s) autenticados"
}

# --- um pedido completo (compra + espera do pagamento) -----------------------
run_order() {
  local seller_token="$1" buyer_token="$2" price="$3" expected_status="$4" label="$5"

  api POST /products "$seller_token" "$(jq -nc --arg n "produto-$label-$RANDOM" --argjson p "$price" \
    '{name:$n,description:"gerado pelo e2e-flow.sh",price:$p,stock:100}')"
  if [[ "$HTTP_STATUS" != "201" ]]; then fail "criar produto ($label): HTTP $HTTP_STATUS $HTTP_BODY"; return; fi
  local product_id; product_id="$(echo "$HTTP_BODY" | jq -r '.id')"
  ok "produto criado ($label, price=$price): $product_id"

  api POST /cart/items "$buyer_token" "$(jq -nc --arg id "$product_id" '{productId:$id,quantity:1}')"
  if [[ "$HTTP_STATUS" != "201" && "$HTTP_STATUS" != "200" ]]; then fail "adicionar ao carrinho ($label): HTTP $HTTP_STATUS $HTTP_BODY"; return; fi
  ok "item adicionado ao carrinho ($label)"

  api POST /cart/checkout "$buyer_token" '{"paymentMethod":"credit_card"}'
  if [[ "$HTTP_STATUS" != "201" ]]; then fail "checkout ($label): HTTP $HTTP_STATUS $HTTP_BODY"; return; fi
  local order_id; order_id="$(echo "$HTTP_BODY" | jq -r '.id')"
  ok "pedido criado ($label): $order_id"

  local tries=15 status="pending"
  local i
  for ((i = 1; i <= tries; i++)); do
    api GET "/payments/$order_id" "$buyer_token"
    if [[ "$HTTP_STATUS" == "200" ]]; then
      status="$(echo "$HTTP_BODY" | jq -r '.status')"
      [[ "$status" != "pending" ]] && break
    fi
    sleep 1
  done

  if [[ "$status" == "$expected_status" ]]; then
    ok "pagamento do pedido $order_id ($label): $status"
  else
    fail "pagamento do pedido $order_id ($label): esperado '$expected_status', obtido '$status' (HTTP $HTTP_STATUS $HTTP_BODY)"
  fi
}

run_cycle() {
  local idx=$((RANDOM % POOL_SIZE))
  local seller_token="${SELLER_TOKEN[$idx]}" buyer_token="${BUYER_TOKEN[$idx]}"

  api GET /products
  [[ "$HTTP_STATUS" == "200" ]] && ok "catalogo (GET /products)" || fail "catalogo (GET /products): HTTP $HTTP_STATUS"

  local normal_price="$((RANDOM % 900 + 15)).00"
  local rejected_price="$((RANDOM % 900 + 15)).99"

  run_order "$seller_token" "$buyer_token" "$normal_price" "approved" "aprovado"
  run_order "$seller_token" "$buyer_token" "$rejected_price" "rejected" "rejeitado"
}

usage() {
  echo "uso: $0 {once|loop} [--interval SEGUNDOS] [--cycles N]"
  exit 1
}

MODE="${1:-once}"; shift || true
INTERVAL=5
CYCLES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    --cycles) CYCLES="$2"; shift 2 ;;
    *) usage ;;
  esac
done

case "$MODE" in
  once|loop) ;;
  *) usage ;;
esac

setup_pool

trap 'echo; info "Encerrando: $STEP_OK passos ok, $STEP_FAIL falhas"; exit $((STEP_FAIL > 0))' INT TERM

cycle_count=0
while true; do
  cycle_count=$((cycle_count + 1))
  info "Ciclo $cycle_count"
  cycle_start=$(date +%s)
  run_cycle
  echo "  (ciclo em $(( $(date +%s) - cycle_start ))s — total: $STEP_OK ok / $STEP_FAIL falhas)"

  [[ "$MODE" == "once" ]] && break
  [[ "$CYCLES" -gt 0 && "$cycle_count" -ge "$CYCLES" ]] && break

  sleep "$INTERVAL"
done

info "Fim: $STEP_OK passos ok, $STEP_FAIL falhas"
exit $((STEP_FAIL > 0))
