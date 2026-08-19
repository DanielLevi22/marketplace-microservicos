# marketplace-microservicos

Projeto de curso com múltiplos microserviços independentes (NestJS), cada um em sua própria pasta na raiz: `api-gateway`, `checkout-service`, `payments-service`, `messaging-service`, `users-service`, etc. Cada serviço tem seu próprio `package.json`, `docker-compose.yaml` e stack própria (a maioria usa TypeORM + PostgreSQL 15).

Por ser um projeto de curso, o código deve ser enxuto: implemente apenas o que está descrito na spec da atividade, sem adicionar funcionalidades, abstrações ou dependências extras "por precaução".

## Fluxo de trabalho

Toda atividade (feature, scaffold, correção relevante) segue este fluxo, nesta ordem:

1. **Criação da spec** — documento de requisitos funcionais e estrutura de dados (sem código), salvo em `<serviço>/docs/specs/NN-nome-da-atividade.md`, com prefixo numérico sequencial (ex.: `01-scaffold.md`, `02-users-crud.md`). A spec descreve o quê e o porquê, não o como implementar.
2. **Análise (PR da spec)** — abrir PR contendo apenas o arquivo da spec, para revisão e aprovação do escopo antes de qualquer código ser escrito.
3. **Plano de desenvolvimento** — com a spec aprovada, gerar um plano de implementação (passos concretos, arquivos afetados, padrão a seguir) e alinhar com o responsável antes de codar.
4. **Testes** — implementar o plano e cobrir com testes (unitários e/ou e2e, conforme a spec). A atividade só é considerada pronta quando os testes passam.
5. **Análise (PR da implementação)** — abrir PR com o código implementado e os testes para revisão final antes do merge.

Não pule etapas: não implementar sem spec aprovada, não abrir PR de implementação sem plano, não considerar a atividade concluída sem testes.

## Convenções entre serviços

- Specs ficam em `<serviço>/docs/specs/`, nomeadas `NN-nome.md`.
- Novo serviço NestJS: criar com `nest new`, mesma stack (`@nestjs/typeorm`, `pg`, `@nestjs/config`, `class-validator`, `class-transformer`), mesmo `.gitignore`/`.prettierrc`/`eslint.config.mjs` dos demais serviços.
- Banco de dados: um container PostgreSQL 15 por serviço via `docker-compose.yaml` próprio (`<serviço>-db`, database `<serviço>_db`, porta exclusiva mapeada para 5432, rede `<serviço>-network`), configurado via variáveis de ambiente (`.env`/`.env.example`) e `src/config/database.config.ts`. `synchronize` ligado em dev; sem migrations por enquanto.
- `main.ts`: `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`), `enableCors()`.
