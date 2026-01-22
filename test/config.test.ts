import { describe, expect, it } from 'vitest';

import { buildRuntimeConfig, parseConfigInput } from '../src/config.js';

describe('config parsing', () => {
  it('builds runtime config with regex matchers', async () => {
    const config = parseConfigInput({
      api: {
        host: '127.0.0.1',
        port: 3000,
        token: 'test-token',
      },
      proxy: {
        listen: {
          host: '127.0.0.1',
          port: 8080,
          serverType: 'http',
        },
        routes: [
          {
            match: {
              domain: {
                pattern: 'example\\.com$',
                flags: 'i',
              },
            },
            upstream: 'http://proxy.local:8080',
          },
        ],
      },
    });

    const runtime = await buildRuntimeConfig(config, process.cwd(), {
      PROXY_ROUTER_API_TOKEN: '',
    });

    const matcher = runtime.proxy.routes[0]?.match?.domain;
    expect(matcher).toBeInstanceOf(RegExp);
    expect((matcher as RegExp).test('sub.example.com')).toBe(true);
  });

  it('throws when api token is missing', async () => {
    const config = parseConfigInput({
      api: {
        host: '127.0.0.1',
        port: 3000,
      },
      proxy: {
        listen: {
          host: '127.0.0.1',
          port: 8080,
          serverType: 'http',
        },
        routes: [],
      },
    });

    await expect(
      buildRuntimeConfig(config, process.cwd(), {
        PROXY_ROUTER_API_TOKEN: '',
      }),
    ).rejects.toThrow('API token is required');
  });

  it('loads https options from files', async () => {
    const config = parseConfigInput({
      api: {
        host: '127.0.0.1',
        port: 3000,
        token: 'test-token',
      },
      proxy: {
        listen: {
          host: '127.0.0.1',
          port: 9443,
          serverType: 'https',
          https: {
            keyFile: 'proxy-chain/test/ssl.key',
            certFile: 'proxy-chain/test/ssl.crt',
          },
        },
        routes: [],
      },
    });

    const runtime = await buildRuntimeConfig(config, process.cwd(), {
      PROXY_ROUTER_API_TOKEN: '',
    });

    expect(runtime.proxy.listen.httpsOptions?.key).toBeDefined();
    expect(runtime.proxy.listen.httpsOptions?.cert).toBeDefined();
  });
});
