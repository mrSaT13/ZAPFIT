# Multi-stage build: build React frontend with Vite and serve via nginx
# Note: This is for the web/frontend deployment. For desktop app, use the compiled EXE.

FROM node:18-alpine AS builder
WORKDIR /app
ENV CI=true
RUN npm set progress=false && npm set audit=false

# Install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps --silent

# Build frontend with Vite
COPY . .
RUN npm run build

# Production stage - serve with nginx
FROM nginx:stable-alpine
LABEL maintainer="mrSaT13"
LABEL version="1.1.0"
LABEL description="ZAPFIT - Performance & Training Analytics"

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80 443
WORKDIR /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]
