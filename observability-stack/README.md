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
| **Grafana** | **3010** | **Dashboards de observabilidade (a criar)** |
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
- Nenhum dashboard ou regra de alerta é criado nesta etapa.
