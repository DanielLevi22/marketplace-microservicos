# marketplace-microservicos
# AWS - Resiliência em Microsserviços

## 1. Timeouts, Retries, and Backoff with Jitter

Artigo da AWS Builders' Library que explica como lidar com falhas temporárias em sistemas distribuídos utilizando:

- Timeouts
- Retries
- Exponential Backoff
- Jitter

🔗 https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

---

## 2. Circuit Breaker Pattern

Documento da AWS Prescriptive Guidance explicando o padrão Circuit Breaker para evitar falhas em cascata quando um serviço dependente está indisponível.

### Conceitos

- Closed State
- Open State
- Half-Open State
- Failure Threshold
- Recovery Timeout
- Fallback

🔗 https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html

---

## 3. Building Resilient Applications

Material da AWS sobre construção de aplicações resilientes e tolerantes a falhas.

### Tópicos

- Fault Tolerance
- High Availability
- Disaster Recovery
- Resilience Patterns
- Monitoring
- Observability

🔗 https://builder.aws.com/content/39oicPbAkQAZkQu2dn8nrrGsBGG/resilience-essentials

---

# Ordem Recomendada de Estudo

1. Timeouts, Retries and Backoff with Jitter
2. Circuit Breaker Pattern
3. Building Resilient Applications

---

# Aplicação Prática no API Gateway (NestJS)

Após estudar esses materiais, implemente:

- Timeout para chamadas HTTP
- Retry com Exponential Backoff
- Circuit Breaker
- Fallback Responses
- Health Checks
- Observabilidade (Logs e Métricas)

Esses padrões ajudam a evitar:

- Falhas em cascata
- Sobrecarga de serviços
- Timeouts infinitos
- Queda total do sistema