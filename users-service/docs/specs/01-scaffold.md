# Spec: Scaffold do users-service

## Contexto

O projeto `marketplace-ms` já possui os seguintes microsserviços:

| Serviço | Porta | Responsabilidade |
|---|---|---|
| api-gateway | 3005 | Roteamento, auth, resiliência |
| checkout-service | 3003 | Carrinho e pedidos |
| payments-service | 3004 | Pagamentos |
| messaging-service | - | Infra RabbitMQ |
| **users-service** | **3000** | **Gerenciar usuários (a criar)** |

O `users-service` ainda não existe além do scaffold básico gerado pelo Nest CLI (`nest new`). Esta spec define o que falta para que o projeto tenha uma base funcional mínima — banco de dados, conexão, módulo de domínio e validação global — sem ainda expor nenhum endpoint. Este é um projeto de curso: a stack e a estrutura devem seguir o mesmo padrão já estabelecido no `payments-service` (referência mais próxima, pois também usa TypeORM + PostgreSQL sem dependências externas de outros serviços).

## Objetivo

Deixar o `users-service` no mesmo nível de maturidade estrutural dos demais serviços (conexão com banco funcionando, projeto rodável localmente via Docker Compose, validação global ativa), pronto para que endpoints e regras de negócio sejam adicionados em specs futuras.

## Requisitos Funcionais

### RF01 — Dependências do projeto
O projeto deve ter as seguintes dependências adicionadas ao scaffold já criado pelo Nest CLI:
- `@nestjs/typeorm` e `typeorm` — ORM e integração com NestJS
- `pg` — driver PostgreSQL
- `@nestjs/config` — carregamento de variáveis de ambiente
- `class-validator` e `class-transformer` — suporte ao `ValidationPipe`

Não devem ser adicionadas dependências de autenticação (JWT, passport, bcrypt) nesta etapa — ficam para uma spec futura de endpoints/auth.

### RF02 — Docker Compose com PostgreSQL 15
Deve existir um `docker-compose.yaml` na raiz do `users-service` subindo um container PostgreSQL 15, seguindo o mesmo formato usado em `checkout-service` e `payments-service`:
- Imagem: `postgres:15`
- Nome do container: `users-db`
- Database: `users_db`
- Usuário/senha: `postgres` / `postgres`
- Porta exposta no host: `5433` (mapeada para `5432` no container)
- Volume nomeado para persistência dos dados
- Rede dedicada (bridge), seguindo o padrão `<serviço>-network`

### RF03 — Configuração de conexão com banco via variáveis de ambiente
A conexão com o banco deve ser inteiramente configurável por variáveis de ambiente (sem valores sensíveis hardcoded), seguindo o padrão dos demais serviços:
- Arquivo `.env` (valores reais de desenvolvimento, não versionado) e `.env.example` (chaves em branco, versionado)
- Variáveis: `PORT`, `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- A aplicação NestJS deve carregar essas variáveis e configurar o `TypeOrmModule` a partir delas, com fallback sensato para desenvolvimento local (mesmo padrão do `database.config.ts` do `payments-service`)
- Em ambiente de desenvolvimento, o schema do banco é sincronizado automaticamente a partir das entidades (sem uso de migrations nesta etapa — mesmo padrão dos outros serviços)

### RF04 — Módulo de usuários (estrutura de domínio)
Deve existir um módulo `users` dentro de `src/`, contendo:
- A entidade `User` (ver estrutura de dados abaixo), registrada no `TypeOrmModule.forFeature`
- O módulo deve ser importado no `AppModule`
- **Não** deve conter controllers nem endpoints HTTP nesta etapa — apenas a estrutura de módulo, entidade e (se necessário para o módulo compilar) um service vazio. Endpoints ficam para uma spec futura.

### RF05 — Validação global
A aplicação deve habilitar um `ValidationPipe` global no bootstrap (`main.ts`), com as mesmas opções usadas nos demais serviços: transformação automática de payloads, remoção de propriedades não declaradas nos DTOs e rejeição de propriedades não esperadas.

## Estrutura de Dados

### Entidade: User

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | Chave primária, gerado automaticamente |
| `email` | string | Obrigatório, único |
| `password` | string | Obrigatório — armazena o hash da senha (a geração do hash é responsabilidade de uma etapa futura; nesta spec o campo existe apenas como coluna) |
| `firstName` | string | Obrigatório |
| `lastName` | string | Obrigatório |
| `role` | enum (`seller`, `buyer`) | Obrigatório |
| `status` | enum (`active`, `inactive`) | Obrigatório, default `active` |
| `createdAt` | timestamp | Gerado automaticamente na criação |
| `updatedAt` | timestamp | Atualizado automaticamente a cada alteração |

Não há, nesta etapa, relacionamentos com outras entidades.

## Fora de Escopo

- Endpoints REST (controllers, DTOs de request/response)
- Autenticação, geração/validação de JWT, hashing de senha
- Migrations (usa-se `synchronize` em desenvolvimento, como nos demais serviços)
- Integração com RabbitMQ/eventos
- Testes automatizados além do que o Nest CLI já gera por padrão

## Critérios de Aceite

- `docker compose up` na pasta `users-service` sobe um PostgreSQL 15 acessível em `localhost:5433`, database `users_db`
- A aplicação NestJS sobe na porta `3000`, conecta no banco usando as variáveis de ambiente e sincroniza a tabela `users` a partir da entidade `User`
- O `ValidationPipe` global está ativo
- O módulo `users` existe, compila e está importado no `AppModule`, sem expor nenhuma rota

## Referências

- Padrão de referência principal: `payments-service` (`docker-compose.yaml`, `src/config/database.config.ts`, `src/main.ts`)
