FROM oven/bun:1.3.13-alpine AS build

WORKDIR /app

ENV HUSKY=0

COPY package.json bun.lock ./
RUN bun ci --frozen-lockfile --omit peer

COPY . .
RUN bun run build

FROM oven/bun:1.3.13-alpine

WORKDIR /app

ENV PORT=8080

RUN rm -f /usr/local/bun-node-fallback-bin/node /usr/local/bun-node-fallback-bin/npm /usr/local/bun-node-fallback-bin/npx

COPY --from=build /app/dist /app

EXPOSE 8080

CMD ["bun", "/app/server.js"]
