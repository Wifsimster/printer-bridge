# --------------------------------------------------------------------------
# Frontend build stage
# --------------------------------------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# --------------------------------------------------------------------------
# Auth sidecar build stage (better-auth + Express)
#
# Must be glibc-based (node:20-slim, not node:20-alpine) so better-sqlite3's
# native binding is compiled against the same libc as the python:3.12-slim
# runtime stage below. Mixing musl (alpine) build with glibc (debian) runtime
# causes ERR_DLOPEN_FAILED on startup (libc.musl-x86_64.so.1: not found).
# --------------------------------------------------------------------------
FROM node:20-slim AS auth-build
WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY auth/package.json auth/package-lock.json* ./
RUN npm ci || npm install
COPY auth/tsconfig.json ./
COPY auth/src ./src
RUN npm run build

# --------------------------------------------------------------------------
# Auth sidecar runtime deps (smaller, no dev deps)
#
# Same libc constraint as auth-build above.
# --------------------------------------------------------------------------
FROM node:20-slim AS auth-deps
WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY auth/package.json auth/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# --------------------------------------------------------------------------
# Runtime stage: Python (FastAPI + printer) + Node (better-auth sidecar)
# --------------------------------------------------------------------------
FROM python:3.12-slim

WORKDIR /app

# Bring in a working Node runtime. python:3.12-slim is debian-based, so we use
# nodejs from apt (current LTS at time of writing).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY discovery.py .
COPY --from=frontend /build/dist ./frontend/dist
COPY --from=auth-build /build/dist ./auth/dist
COPY --from=auth-deps /build/node_modules ./auth/node_modules
COPY auth/package.json ./auth/package.json
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080
VOLUME ["/app/data"]

ENV PRINTCAST_AUTH_URL=http://127.0.0.1:8090 \
    AUTH_BASE_URL=http://127.0.0.1:8090 \
    AUTH_PORT=8090 \
    AUTH_HOST=127.0.0.1

CMD ["/usr/local/bin/entrypoint.sh"]
