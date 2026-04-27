# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile --filter @code-atlas/frontend

COPY packages/frontend packages/frontend
RUN pnpm --filter @code-atlas/frontend build

# Stage 2: Build backend
FROM node:22-alpine AS backend-build
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile --filter @code-atlas/backend

COPY packages/backend packages/backend
RUN pnpm --filter @code-atlas/backend build

# Stage 3: Production
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache git nginx && corepack enable pnpm

# Copy backend
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/backend/package.json packages/backend/
RUN pnpm install --frozen-lockfile --filter @code-atlas/backend --prod

COPY --from=backend-build /app/packages/backend/dist packages/backend/dist

# Copy frontend build
COPY --from=frontend-build /app/packages/frontend/dist /usr/share/nginx/html

# Nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Data directories
RUN mkdir -p /data/projects /data/db

# Start script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
