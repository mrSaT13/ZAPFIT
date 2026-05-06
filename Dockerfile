# Multi-stage build: build renderer with Vite and serve via nginx

FROM node:18-alpine AS builder
WORKDIR /app
ENV CI=true
COPY package*.json ./
RUN npm ci --silent
COPY . .
RUN npm run build --silent

FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
