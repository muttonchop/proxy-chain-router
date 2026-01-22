import Fastify, { type FastifyInstance } from 'fastify';

import type { ConfigFile, ProxyConfigInput } from './config.js';
import { parseConfigInput } from './config.js';
import type { ConfigStore } from './config-store.js';
import type { ProxyManager } from './proxy-manager.js';

type ApiDependencies = {
  manager: ProxyManager;
  store: ConfigStore;
  logger?: boolean;
};

export function createApiServer({ manager, store, logger = false }: ApiDependencies): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/health', async () => {
    const status = manager.getStatus();
    return {
      status: 'ok',
      configPath: store.configPath,
      proxyRunning: status?.running ?? false,
    };
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/v1')) {
      return;
    }

    const token = store.getRuntime().api.token;
    const headerToken = extractToken(request.headers);

    if (!headerToken || headerToken !== token) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
  });

  app.get('/v1/proxy', async () => {
    const config = store.getConfig();
    return {
      config: config.proxy,
      status: manager.getStatus(),
    };
  });

  app.put('/v1/proxy', async (request, reply) => {
    const current = store.getConfig();
    const previousRuntime = store.getRuntime();

    try {
      const input = request.body as ProxyConfigInput;
      const candidate = parseConfigInput({
        api: current.api,
        proxy: {
          ...input,
          routes: current.proxy.routes,
        },
      });
      const runtime = await store.save(candidate);
      await manager.applyConfig(runtime.proxy);
      return {
        config: candidate.proxy,
        status: manager.getStatus(),
      };
    } catch (error) {
      await store.save(current);
      await manager.applyConfig(previousRuntime.proxy);
      reply.code(400);
      return { error: error instanceof Error ? error.message : 'Failed to update proxy' };
    }
  });

  app.get('/v1/routes', async () => {
    const config = store.getConfig();
    return { routes: config.proxy.routes ?? [] };
  });

  app.put('/v1/routes', async (request, reply) => {
    const current = store.getConfig();
    const previousRuntime = store.getRuntime();

    try {
      const routes = request.body as ProxyConfigInput['routes'];
      const candidate = parseConfigInput({
        api: current.api,
        proxy: {
          ...current.proxy,
          routes: routes ?? [],
        },
      });
      const runtime = await store.save(candidate);
      await manager.applyConfig(runtime.proxy);
      return { routes: candidate.proxy.routes ?? [] };
    } catch (error) {
      await store.save(current);
      await manager.applyConfig(previousRuntime.proxy);
      reply.code(400);
      return { error: error instanceof Error ? error.message : 'Failed to update routes' };
    }
  });

  app.post('/v1/reload', async (request, reply) => {
    try {
      const runtime = await store.reload();
      await manager.applyConfig(runtime.proxy);
      return { status: 'reloaded' };
    } catch (error) {
      reply.code(400);
      return {
        error: error instanceof Error ? error.message : 'Failed to reload config',
      };
    }
  });

  app.get('/v1/metrics', async () => {
    const status = manager.getStatus();
    return {
      status,
      metrics: status?.metrics ?? null,
    };
  });

  return app;
}

function extractToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const auth = headers.authorization;
  if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const header = headers['x-api-token'];
  if (Array.isArray(header)) {
    return header[0];
  }

  if (typeof header === 'string') {
    return header;
  }

  return undefined;
}
