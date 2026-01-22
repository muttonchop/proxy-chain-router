# proxy-chain-router

Deployable REST API service for managing a proxy-chain server with routing rules,
configuration persistence, and basic metrics.

Docs and roadmap are in `merged-wiki.txt`.

## Install

```bash
npm install
```

## Quick start

1) Create a config file (see `config.example.json`).
2) Run the API service:

```bash
npm run build
node dist/main.js --config config.json
```

The service will start:
- The REST API (default `0.0.0.0:3000`).
- A proxy-chain server (defined in the config).

## Docker (local)
```bash
docker compose up --build
```

See `merged-wiki.txt` for Docker details and the roadmap.

## Configuration

Configuration is loaded from disk on startup and persisted when you update it via the API.
Use `PROXY_ROUTER_CONFIG` or `--config` to point at a config file.

Example: `config.example.json`

```json
{
  "api": {
    "host": "0.0.0.0",
    "port": 3000,
    "token": "change-me"
  },
  "proxy": {
    "listen": {
      "host": "0.0.0.0",
      "port": 8080,
      "serverType": "http"
    },
    "routes": [
      {
        "name": "google",
        "match": {
          "domain": { "pattern": "google\\.com$", "flags": "i" }
        },
        "upstream": "http://user:pass@us-proxy.example.com:8000"
      },
      {
        "name": "fallback",
        "upstream": null
      }
    ],
    "verbose": false
  }
}
```

### Environment overrides

- `PROXY_ROUTER_CONFIG`: config file path.
- `PROXY_ROUTER_API_TOKEN`: overrides `api.token`.
- `PROXY_ROUTER_API_HOST`: overrides `api.host`.
- `PROXY_ROUTER_API_PORT`: overrides `api.port`.

## API authentication

All `/v1/*` endpoints require an API token. Use either:
- `Authorization: Bearer <token>`
- `X-API-Token: <token>`

## API endpoints

- `GET /health`: basic health check.
- `POST /v1/reload`: reloads config from disk.
- `GET /v1/proxy`: proxy config and status.
- `PUT /v1/proxy`: replace proxy listen settings (routes preserved).
- `GET /v1/routes`: list routing rules.
- `PUT /v1/routes`: replace routing rules.
- `GET /v1/metrics`: proxy metrics and status.
