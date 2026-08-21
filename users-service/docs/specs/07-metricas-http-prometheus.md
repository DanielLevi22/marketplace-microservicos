# Spec: Métricas HTTP com prom-client

## Contexto

A `observability-stack/` (ver `docs/specs/02-observability-stack-prometheus-grafana.md`, na raiz do repositório) já está no ar com Prometheus configurado para fazer scrape de `GET /metrics` em cada um dos 5 serviços a cada 15s, incluindo o job `users-service` apontando para `host.docker.internal:3000/metrics`. Como nenhum serviço expõe esse endpoint ainda, o target `users-service` aparece como `DOWN` no Prometheus.

O `users-service` (porta 3000) protege todas as rotas por padrão através de um `JwtAuthGuard` global (`APP_GUARD`, registrado em `src/auth/auth.module.ts`), com rotas específicas liberadas via decorator `@Public()` (`src/auth/decorators/public.decorator.ts`) — ver `docs/specs/04-guards-protecao-rotas-jwt.md`. O endpoint `/metrics` precisa ser acessível pelo Prometheus sem token, então precisa ser marcado como `@Public()`.

Esta spec cobre exclusivamente a exposição de métricas técnicas de HTTP (contagem e duração de requisições) via `prom-client`, no formato que o Prometheus já está configurado para consumir. Métricas de negócio (ex.: usuários cadastrados, logins realizados) ficam para uma spec futura.

## Objetivo

Fazer o `users-service` expor `GET /metrics` em formato Prometheus, contendo métricas HTTP (contagem e duração de requisições por método/rota/status) e as métricas padrão do Node.js, sem exigir autenticação, de forma que o job `users-service` no Prometheus passe a `UP`.

## Requisitos Funcionais

### RF01 — Dependência `prom-client`
Adicionar `prom-client` como dependência do `users-service`.

### RF02 — `MetricsModule` global
Criar um módulo `MetricsModule`, marcado com `@Global()` e importado no `AppModule`, agrupando o serviço, o interceptor e o controller descritos abaixo — para que o `MetricsService` possa ser injetado em qualquer módulo sem reimportação explícita.

### RF03 — `MetricsService`
Deve existir um `MetricsService` responsável por:
- Manter um `Registry` próprio do `prom-client`.
- Registrar um `Counter` `http_requests_total`, com labels `method`, `route` e `status_code`, incrementado a cada requisição HTTP finalizada.
- Registrar um `Histogram` `http_request_duration_seconds`, com os mesmos labels, observando a duração de cada requisição HTTP em segundos.
- Habilitar a coleta das métricas padrão do processo Node.js (`collectDefaultMetrics`) no mesmo registry.
- Expor um método que retorne, de forma assíncrona, o conteúdo do registry serializado no formato de texto do Prometheus, junto do `Content-Type` correspondente.

### RF04 — `HttpMetricsInterceptor`
Deve existir um interceptor, registrado globalmente via `APP_INTERCEPTOR`, que para cada requisição HTTP:
- Marque o instante de início antes de a requisição seguir para o handler.
- Ao finalizar a resposta (sucesso ou erro), calcule a duração, obtenha `method`, o padrão de rota (não a URL crua — ex.: `/users/:id`, não `/users/123`, para não gerar séries com cardinalidade alta) e `status_code`.
- Incremente o `Counter` e observe a duração no `Histogram` do `MetricsService` com esses labels.
- **Não** processe a própria requisição a `GET /metrics` (ver RN01).

### RF05 — `MetricsController`
Deve existir um controller com `GET /metrics`, marcado com `@Public()`, que:
- Retorne o conteúdo produzido pelo `MetricsService` (RF03) com o `Content-Type` apropriado (`text/plain; version=0.0.4` ou o que o `prom-client` definir).
- Não exija JWT, mesmo com o `JwtAuthGuard` global ativo.

### RF06 — Registro no `AppModule`
O `MetricsModule` deve ser importado em `src/app.module.ts`, junto dos demais módulos já existentes (`UsersModule`, `AuthModule`, `HealthModule`).

## Regras de Negócio

- RN01 — A requisição a `GET /metrics` não deve ser contabilizada nas próprias métricas HTTP (nem no `Counter`, nem no `Histogram`), para evitar que o endpoint de scrape polua a série que ele mesmo expõe.
- RN02 — `/metrics` é acessível sem `Authorization` header, mesmo com o guard JWT global ativo em todas as demais rotas.
- RN03 — O label `route` deve refletir o padrão de rota declarado no controller, não a URL literal recebida, para não gerar uma série de métrica por identificador único (UUID, e-mail etc.).

## Fora de Escopo

- Métricas de negócio (ex.: total de usuários cadastrados, taxa de sucesso de login, tempo de hash de senha) — spec futura.
- Dashboards no Grafana — spec futura.
- Qualquer alteração no Prometheus ou no Grafana (`observability-stack/`) — já configurados.
- Tracing distribuído, logs estruturados ou correlação de request ID.
- Métricas de banco de dados (TypeORM/PostgreSQL) ou de filas.

## Fluxo da Implementação

```mermaid
flowchart TD
    A[Requisicao HTTP chega no users-service] --> B{Rota e GET /metrics?}
    B -->|Sim| C[MetricsController: MetricsService serializa registry]
    C --> D[Resposta text/plain com metricas Prometheus]
    B -->|Nao| E[HttpMetricsInterceptor marca inicio]
    E --> F[JwtAuthGuard: publica ou valida JWT]
    F --> G[Handler processa a requisicao]
    G --> H[Interceptor calcula duracao, method, route, status_code]
    H --> I[Counter http_requests_total incrementado]
    H --> J[Histogram http_request_duration_seconds observado]
    I --> K[Resposta HTTP enviada ao cliente]
    J --> K

    L[Prometheus faz scrape GET /metrics a cada 15s] --> D
    D --> M[Job users-service fica UP no Prometheus]
```

## Tabela de Métricas Expostas

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total de requisições HTTP processadas |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duração das requisições HTTP, em segundos |
| `process_cpu_*`, `process_resident_memory_bytes`, `nodejs_*`, etc. | Gauge/Counter (via `collectDefaultMetrics`) | — | Métricas padrão do processo Node.js (CPU, memória, event loop, GC) |

## Critérios de Aceite

- `curl http://localhost:3000/metrics` (sem header `Authorization`) retorna `200 OK`, com corpo em formato texto do Prometheus contendo, no mínimo, `http_requests_total`, `http_request_duration_seconds` e alguma métrica com prefixo `process_` ou `nodejs_`.
- Após algumas requisições a rotas existentes (ex.: `POST /auth/login`, `GET /users`), o `curl` acima mostra o `Counter` `http_requests_total` incrementado com os labels `method`, `route` e `status_code` corretos para essas rotas.
- Nenhuma série em `/metrics` referencia a rota `/metrics` (RN01) — o endpoint não se autocontabiliza.
- Uma requisição a uma rota protegida sem token continua retornando `401 Unauthorized` (nenhuma regressão no `JwtAuthGuard`).
- No Prometheus (`http://localhost:9090/targets`), o job `users-service` aparece como `UP`.

## Referências

- `docs/specs/02-observability-stack-prometheus-grafana.md` — infraestrutura Prometheus/Grafana já configurada, jobs de scrape.
- `users-service/docs/specs/04-guards-protecao-rotas-jwt.md` — padrão de `JwtAuthGuard` global e `@Public()` já usado neste serviço.
- Documentação oficial: [prom-client](https://github.com/siimon/prom-client), [Prometheus - Histograms and summaries](https://prometheus.io/docs/practices/histograms/).
