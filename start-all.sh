#!/usr/bin/env bash
# Sobe (ou derruba) o marketplace inteiro: RabbitMQ, os 4 bancos Postgres e os 5
# serviços NestJS (users, products, checkout, payments, api-gateway), fora do Docker.
#
# Uso:
#   ./start-all.sh [start] [--with-observability]   - sobe tudo (padrão)
#   ./start-all.sh stop                              - derruba tudo que este script subiu
#   ./start-all.sh status                            - mostra o estado atual
#   ./start-all.sh logs <servico>                    - segue o log de um serviço (ex.: api-gateway)

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"

SERVICE_ORDER=(users-service products-service payments-service checkout-service api-gateway)
declare -A SERVICE_PORT=(
  [users-service]=3000
  [products-service]=3001
  [checkout-service]=3003
  [payments-service]=3004
  [api-gateway]=3005
)
declare -A SERVICE_DB_CONTAINER=(
  [users-service]=users-db
  [products-service]=products-db
  [checkout-service]=checkout-db
  [payments-service]=payments-db
)
declare -A SERVICE_DB_NAME=(
  [users-service]=users_db
  [products-service]=products_db
  [checkout-service]=checkout_db
  [payments-service]=payments_db
)

if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

info()  { echo -e "${BLUE}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  ok${NC}  $*"; }
warn()  { echo -e "${YELLOW}  ..${NC}  $*"; }
fail()  { echo -e "${RED}  falhou${NC} $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { fail "comando '$1' não encontrado no PATH"; exit 1; }
}

compose() {
  # roda docker compose (v2) dentro do diretório informado, com fallback para docker-compose (v1)
  local dir="$1"; shift
  if docker compose version >/dev/null 2>&1; then
    (cd "$dir" && docker compose "$@")
  else
    (cd "$dir" && docker-compose "$@")
  fi
}

wait_for_db() {
  local service="$1" container="${SERVICE_DB_CONTAINER[$service]}" db="${SERVICE_DB_NAME[$service]}"
  local tries=30
  printf "  aguardando %s" "$container"
  local i
  for ((i = 1; i <= tries; i++)); do
    if docker exec "$container" pg_isready -U postgres -d "$db" >/dev/null 2>&1; then
      echo " -> pronto"
      return 0
    fi
    printf "."
    sleep 1
  done
  echo " -> TIMEOUT"
  return 1
}

open_url() {
  local url="$1"
  if command -v wslview >/dev/null 2>&1; then
    wslview "$url" >/dev/null 2>&1 &
  elif command -v explorer.exe >/dev/null 2>&1; then
    # explorer.exe sempre retorna exit code 1 mesmo abrindo com sucesso (comportamento
    # normal no WSL) — por isso o '|| true', pra nao ser tratado como falha.
    explorer.exe "$url" >/dev/null 2>&1 &
    true
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    open "$url" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  else
    warn "não consegui detectar como abrir o navegador — acesse manualmente: $url"
  fi
}

wait_for_http() {
  local url="$1" tries="${2:-60}"
  local i
  for ((i = 1; i <= tries; i++)); do
    if curl -sf -o /dev/null "$url"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_infra() {
  info "Subindo RabbitMQ (messaging-service)"
  compose "$ROOT_DIR/messaging-service" up -d
  ok "RabbitMQ (management UI em http://localhost:15672, admin/admin)"

  info "Subindo bancos Postgres de cada serviço"
  for service in "${!SERVICE_DB_CONTAINER[@]}"; do
    compose "$ROOT_DIR/$service" up -d
  done
  for service in "${!SERVICE_DB_CONTAINER[@]}"; do
    wait_for_db "$service" || { fail "banco de $service não ficou pronto a tempo"; exit 1; }
  done
}

start_service() {
  local service="$1" port="${SERVICE_PORT[$service]}" dir="$ROOT_DIR/$service"

  if [[ ! -d "$dir/node_modules" ]]; then
    warn "$service sem node_modules, rodando npm install"
    (cd "$dir" && npm install)
  fi

  info "Iniciando $service (porta $port)"
  (
    cd "$dir" || exit 1
    # setsid isola num novo grupo de processos: 'npm run start:dev' gera um processo
    # filho ('nest start --watch') que não morre junto se so matarmos o PID do npm.
    # Guardando o PID do próprio setsid, dá pra matar o grupo inteiro em cmd_stop.
    setsid nohup npm run start:dev >"$LOG_DIR/$service.log" 2>&1 &
    echo $! >"$PID_DIR/$service.pid"
  )

  if wait_for_http "http://localhost:$port/health" 90; then
    ok "$service respondendo em /health"
  else
    fail "$service não respondeu em /health a tempo — veja $LOG_DIR/$service.log"
  fi
}

cmd_start() {
  mkdir -p "$LOG_DIR" "$PID_DIR"
  require_cmd docker
  require_cmd npm
  require_cmd curl

  start_infra

  for service in "${SERVICE_ORDER[@]}"; do
    start_service "$service"
  done

  if [[ "${1:-}" == "--with-observability" ]]; then
    info "Subindo observability-stack (Prometheus + Grafana)"
    compose "$ROOT_DIR/observability-stack" up -d
    ok "Prometheus em http://localhost:9090, Grafana em http://localhost:3010"
  fi

  info "Abrindo navegador"
  open_url "http://localhost:${SERVICE_PORT[api-gateway]}/api"
  if [[ "${1:-}" == "--with-observability" ]]; then
    open_url "http://localhost:3010/d/marketplace-overview"
  fi

  echo
  info "Marketplace no ar"
  echo "  api-gateway     http://localhost:3005  (Swagger em /api)"
  echo "  users-service   http://localhost:3000"
  echo "  products-service http://localhost:3001"
  echo "  checkout-service http://localhost:3003"
  echo "  payments-service http://localhost:3004"
  echo "  RabbitMQ mgmt   http://localhost:15672  (admin/admin)"
  [[ "${1:-}" == "--with-observability" ]] && echo "  Prometheus      http://localhost:9090" && echo "  Grafana         http://localhost:3010"
  echo
  echo "Logs em $LOG_DIR/<servico>.log — use '$0 logs <servico>' para acompanhar."
  echo "Para derrubar tudo: '$0 stop'"
}

cmd_stop() {
  info "Parando processos Node"
  for service in "${SERVICE_ORDER[@]}"; do
    local port="${SERVICE_PORT[$service]}" pid_file="$PID_DIR/$service.pid"

    # 'nest start --watch' roda o processo real (node dist/main) em um process
    # group proprio (pra sobreviver a restarts do hot-reload), separado do
    # grupo do npm/nest-cli — matar so o PID gravado no start nao alcanca ele.
    # Matar por porta e o jeito confiavel de parar o que realmente esta escutando.
    if fuser -k -TERM "${port}/tcp" >/dev/null 2>&1; then
      sleep 1
      fuser -k -KILL "${port}/tcp" >/dev/null 2>&1
      ok "$service (porta $port) parado"
    else
      warn "$service (porta $port) já não estava rodando"
    fi

    if [[ -f "$pid_file" ]]; then
      local pid; pid=$(cat "$pid_file")
      kill -TERM -- "-$pid" >/dev/null 2>&1
      rm -f "$pid_file"
    fi
  done

  info "Derrubando containers"
  for service in "${!SERVICE_DB_CONTAINER[@]}"; do
    compose "$ROOT_DIR/$service" down >/dev/null 2>&1 && ok "$service: banco derrubado"
  done
  compose "$ROOT_DIR/messaging-service" down >/dev/null 2>&1 && ok "RabbitMQ derrubado"
  compose "$ROOT_DIR/observability-stack" down >/dev/null 2>&1 && ok "observability-stack derrubado"
}

cmd_status() {
  for service in "${SERVICE_ORDER[@]}"; do
    local port="${SERVICE_PORT[$service]}" pid_file="$PID_DIR/$service.pid" pid="-"
    [[ -f "$pid_file" ]] && pid=$(cat "$pid_file")
    if [[ "$pid" != "-" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      if curl -sf -o /dev/null "http://localhost:$port/health"; then
        ok "$service (pid $pid, porta $port) — /health OK"
      else
        warn "$service (pid $pid, porta $port) — processo vivo, /health falhando"
      fi
    else
      fail "$service — não está rodando"
    fi
  done
}

cmd_logs() {
  local service="${1:-}"
  [[ -z "$service" ]] && { fail "uso: $0 logs <servico>"; exit 1; }
  local log_file="$LOG_DIR/$service.log"
  [[ -f "$log_file" ]] || { fail "sem log para '$service' em $log_file"; exit 1; }
  tail -f "$log_file"
}

case "${1:-start}" in
  start|up) shift || true; cmd_start "${1:-}" ;;
  stop|down) cmd_stop ;;
  status) cmd_status ;;
  logs) shift; cmd_logs "${1:-}" ;;
  *) echo "uso: $0 {start [--with-observability]|stop|status|logs <servico>}"; exit 1 ;;
esac
