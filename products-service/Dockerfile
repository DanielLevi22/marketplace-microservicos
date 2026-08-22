# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# better-sqlite3 (usado nos testes) e nativo e so compila com toolchain de build
RUN apk add --no-cache python3 make g++ && npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY package*.json ./
# --omit=dev e --omit=optional pulam o better-sqlite3 (dev-only e tambem
# dependencia opcional do typeorm), entao nao precisa de toolchain de build aqui
RUN npm ci --omit=dev --omit=optional
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:$PORT/health" || exit 1

CMD ["node", "dist/main"]
