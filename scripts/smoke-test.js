#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
const token = process.env.API_TOKEN || 'change-me';

function requestJson(path, headers = {}) {
  const url = new URL(path, baseUrl);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            json = null;
          }
          resolve({
            statusCode: res.statusCode ?? 0,
            json,
            body,
          });
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Request timed out: ${url.toString()}`));
    });
    req.on('error', (error) => {
      if (error instanceof Error) {
        const code = 'code' in error ? ` (${String(error.code)})` : '';
        const details = error.message || error.stack || '';
        reject(new Error(`Request failed: GET ${url.toString()}${code} ${details}`.trim()));
        return;
      }
      reject(new Error(`Request failed: GET ${url.toString()} - ${String(error)}`));
    });
    req.end();
  });
}

async function run() {
  const health = await requestJson('/health');
  if (health.statusCode !== 200) {
    throw new Error(`Health check failed: ${health.statusCode} ${health.body}`);
  }
  if (health.json && health.json.status !== 'ok') {
    throw new Error(`Health status not ok: ${JSON.stringify(health.json)}`);
  }

  const proxy = await requestJson('/v1/proxy', {
    Authorization: `Bearer ${token}`,
  });
  if (proxy.statusCode !== 200) {
    throw new Error(`Proxy check failed: ${proxy.statusCode} ${proxy.body}`);
  }

  console.log('Smoke test passed.');
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
