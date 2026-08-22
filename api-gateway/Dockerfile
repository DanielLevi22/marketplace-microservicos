# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3005

# /health/live e liveness pura do gateway (sempre 200 se o processo estiver de pe);
# /health agrega o pingCheck dos 4 servicos downstream, o que faria o container do
# gateway reportar "unhealthy" por causa de uma dependencia, nao dele mesmo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://localhost:$PORT/health/live" || exit 1

CMD ["node", "dist/main"]
