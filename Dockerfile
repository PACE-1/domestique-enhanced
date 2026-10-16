# Server image: Python core + compiled React UI (served at /v2). Roadmap #12, #13.
# Access control: the image runs in server mode, so it refuses to start without
# a token (see docs/SERVER.md):
#   docker run -p 127.0.0.1:22400:22400 -v domestique-data:/data \
#     -e DOMESTIQUE_ACCESS_TOKEN=<long random secret> <image>
# Publish on loopback and put TLS in front of it for remote access.
# Single worker is required: per-process caches and one sync owner.

FROM node:24-slim AS web
WORKDIR /web
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.12-slim
WORKDIR /app
COPY requirements-server.txt requirements-linux-py312.lock ./
RUN pip install --no-cache-dir -r requirements-server.txt -c requirements-linux-py312.lock
COPY VERSION ./VERSION
COPY src ./src
COPY --from=web /web/dist ./web/dist
ENV DOMESTIQUE_HOME=/data PYTHONPATH=/app/src PYTHONUNBUFFERED=1 DOMESTIQUE_SERVER_MODE=1
VOLUME /data
EXPOSE 22400
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:22400/healthz', timeout=4)"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "22400", "--workers", "1"]
