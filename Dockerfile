FROM oven/bun:1.3.13-alpine AS build

WORKDIR /app

ENV HUSKY=0

COPY package.json bun.lock ./
RUN bun ci --frozen-lockfile --omit peer

COPY . .
RUN bun run build

FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 8080
