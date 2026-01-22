FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PROXY_ROUTER_CONFIG=/data/config.json

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
RUN mkdir -p /data
COPY config.example.json /data/config.json

EXPOSE 3000 8080

CMD ["node", "dist/main.js"]
