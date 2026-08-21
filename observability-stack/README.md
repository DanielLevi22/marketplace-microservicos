# observability-stack

Infraestrutura de observabilidade do marketplace: coleta de métricas (Prometheus) e visualização (Grafana).

## Mapa de portas

| Serviço | Porta | Responsabilidade |
|---|---|---|
| users-service | 3000 | Gerenciar usuários |
| products-service | 3001 | Catálogo de produtos |
| checkout-service | 3003 | Carrinho e pedidos |
| payments-service | 3004 | Pagamentos |
| api-gateway | 3005 | Roteamento, auth, resiliência |
| **Grafana** | **3010** | **Dashboards de observabilidade** |
| messaging-service (RabbitMQ) | 5672 / 15672 | Infra de mensageria |
| **Prometheus** | **9090** | **Coleta e armazenamento de métricas** |

## Como usar

### Subir a stack

```bash
cp .env.example .env   # preencher GF_SECURITY_ADMIN_USER e GF_SECURITY_ADMIN_PASSWORD
docker compose up -d
```

### Derrubar a stack

```bash
docker compose down
```

### Acesso

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3010 (login com o usuário/senha definidos no `.env`)

## Observações

- O datasource Prometheus já vem configurado no Grafana ao subir (provisioning), sem passos manuais.
- Os 6 jobs de scrape do Prometheus podem ser conferidos em Status → Targets. O job `prometheus` (self-scrape) fica `UP`; os 5 jobs dos serviços do marketplace ficam `DOWN` até eles exporem `/metrics` — isso será feito em uma spec futura de instrumentação.
- Os dashboards "Marketplace Overview" e "Service Details" já vêm provisionados na pasta "Marketplace" do Grafana ao subir a stack, sem import manual. Nenhuma regra de alerta é criada nesta etapa.

## Queries PromQL de referência

| Uso | Query |
|---|---|
| Status UP/DOWN por serviço | `up{job="<service>"}` |
| Throughput geral (req/s) por serviço | `sum by (job) (rate(http_requests_total[1m]))` |
| Taxa de erro 4xx/5xx por serviço | `sum by (job) (rate(http_requests_total{status_code=~"4..\|5.."}[5m])) / sum by (job) (rate(http_requests_total[5m]))` |
| Latência P95 por serviço | `histogram_quantile(0.95, sum by (job, le) (rate(http_request_duration_seconds_bucket[5m])))` |
| Memória residente por serviço | `process_resident_memory_bytes{job="<service>"}` |
| Rate por rota (dentro de um serviço) | `sum by (route) (rate(http_requests_total{job="<service>"}[5m]))` |
| Duration P50/P95/P99 por rota | `histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="<service>"}[5m])))` |
| Top rotas por volume | `topk(10, sum by (route) (rate(http_requests_total{job="<service>"}[5m])))` |
| Distribuição de status codes | `sum by (status_code) (increase(http_requests_total{job="<service>"}[1h]))` |
| CPU do processo | `rate(process_cpu_seconds_total{job="<service>"}[5m])` |
| Event loop lag | `nodejs_eventloop_lag_seconds{job="<service>"}` |
| Pagamentos aprovados/rejeitados (taxa) | `rate(payments_approved_total[5m])`, `rate(payments_rejected_total[5m])` |
| Pagamentos rejeitados por motivo | `sum by (reason) (increase(payments_rejected_total[1h]))` |
| Pedidos criados (total na janela) | `increase(orders_created_total[1h])` |
| Mensagens publicadas no RabbitMQ por fila | `sum by (queue) (rate(rabbitmq_messages_published_total[5m]))` |
