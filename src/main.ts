import process from 'node:process';

import { ConfigStore } from './config-store.js';
import { createApiServer } from './api.js';
import { ProxyManager } from './proxy-manager.js';

type Args = {
  configPath: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const store = new ConfigStore(args.configPath);
  const runtime = await store.load();

  const manager = new ProxyManager();
  await manager.applyConfig(runtime.proxy);

  const app = createApiServer({ manager, store, logger: false });
  await app.listen({ port: runtime.api.port, host: runtime.api.host });

  const shutdown = async () => {
    await app.close();
    await manager.stop();
  };

  process.on('SIGINT', () => {
    shutdown().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdown().then(() => process.exit(0));
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

function parseArgs(argv: string[]): Args {
  const configIndex = argv.findIndex((arg) => arg === '--config');
  const configPath =
    (configIndex !== -1 && argv[configIndex + 1]) ||
    process.env.PROXY_ROUTER_CONFIG ||
    'config.json';

  return { configPath };
}
