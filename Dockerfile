FROM node:26-alpine AS build

WORKDIR /app

ENV HUSKY=0

RUN npm install --global npm@12

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 8080
