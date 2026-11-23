# syntax=docker/dockerfile:1

# ---- 1. Install all workspace dependencies (cached while package files are unchanged) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts --no-audit --no-fund

# ---- 2. Build the React frontend into frontend/dist ----
FROM deps AS build
COPY frontend frontend
RUN npm run build -w frontend

# ---- 3. Runtime: backend production dependencies + built frontend ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace=backend --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY backend/src backend/src
COPY --from=build /app/frontend/dist frontend/dist
RUN mkdir -p backend/uploads && chown -R node:node backend/uploads

USER node
WORKDIR /app/backend
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health > /dev/null || exit 1
CMD ["node", "src/server.js"]
