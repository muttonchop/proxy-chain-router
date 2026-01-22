import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createApiServer } from '../src/api.js';
import { ConfigStore } from '../src/config-store.js';
import { ProxyManager } from '../src/proxy-manager.js';

async function setupApi() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-router-'));
  const configPath = path.join(dir, 'config.json');
  const config = {
    api: {
      host: '127.0.0.1',
      port: 3000,
      token: 'test-token',
    },
    proxy: {
      listen: {
        host: '127.0.0.1',
        port: 18080,
        serverType: 'http',
      },
      routes: [],
    },
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

  const store = new ConfigStore(configPath);
  const runtime = await store.load();
  const manager = new ProxyManager();
  await manager.applyConfig(runtime.proxy);

  const app = createApiServer({ manager, store, logger: false });

  return { app, store, manager };
}

describe('API auth', () => {
  it('rejects unauthorized requests', async () => {
    const { app, manager } = await setupApi();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/proxy',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
    await manager.stop();
  });

  it('allows authorized requests', async () => {
    const { app, manager } = await setupApi();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/proxy',
      headers: {
        authorization: 'Bearer test-token',
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.config.listen.port).toBe(18080);
    await app.close();
    await manager.stop();
  });
});

describe('config updates', () => {
  it('updates config via API', async () => {
    const { app, manager } = await setupApi();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/proxy',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        listen: {
          host: '127.0.0.1',
          port: 18081,
          serverType: 'http',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.config.listen.port).toBe(18081);
    await app.close();
    await manager.stop();
  });
});
