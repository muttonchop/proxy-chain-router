import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { DomainMatcher, ProxyListenOptions, ProxyRuntimeConfig, RouteRule } from './types.js';

export type DomainMatcherInput =
  | string
  | {
      pattern: string;
      flags?: string;
    };

export type RouteMatchInput = {
  domain?: DomainMatcherInput;
  hostname?: DomainMatcherInput;
  port?: number | number[];
  isHttp?: boolean;
  method?: string | string[];
};

export type RouteRuleInput = {
  name?: string;
  match?: RouteMatchInput;
  upstream?: string | string[] | null;
};

export type ListenConfigInput = {
  host?: string;
  port: number;
  serverType?: 'http' | 'https';
  https?: {
    keyFile: string;
    certFile: string;
    caFile?: string;
    passphrase?: string;
  };
};

export type ProxyConfigInput = {
  listen: ListenConfigInput;
  routes?: RouteRuleInput[];
  verbose?: boolean;
  authRealm?: string;
};

export type ApiConfigInput = {
  host?: string;
  port?: number;
  token?: string;
};

export type ConfigFile = {
  api: ApiConfigInput;
  proxy: ProxyConfigInput;
};

export type ApiRuntimeConfig = {
  host: string;
  port: number;
  token: string;
};

export type RuntimeConfig = {
  api: ApiRuntimeConfig;
  proxy: ProxyRuntimeConfig;
};

const DomainMatcherSchema = z.union([
  z.string().min(1),
  z
    .object({
      pattern: z.string().min(1),
      flags: z.string().optional(),
    })
    .strict(),
]);

const RouteMatchSchema = z
  .object({
    domain: DomainMatcherSchema.optional(),
    hostname: DomainMatcherSchema.optional(),
    port: z
      .union([
        z.number().int().min(1).max(65535),
        z.array(z.number().int().min(1).max(65535)).nonempty(),
      ])
      .optional(),
    isHttp: z.boolean().optional(),
    method: z.union([z.string(), z.array(z.string()).nonempty()]).optional(),
  })
  .strict();

const RouteSchema = z
  .object({
    name: z.string().optional(),
    match: RouteMatchSchema.optional(),
    upstream: z.union([z.string(), z.array(z.string()).nonempty(), z.null()]).optional(),
  })
  .strict();

const ListenSchema = z
  .object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().min(1).max(65535),
    serverType: z.enum(['http', 'https']).default('http'),
    https: z
      .object({
        keyFile: z.string().min(1),
        certFile: z.string().min(1),
        caFile: z.string().optional(),
        passphrase: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const ProxySchema = z
  .object({
    listen: ListenSchema,
    routes: z.array(RouteSchema).default([]),
    verbose: z.boolean().default(false),
    authRealm: z.string().optional(),
  })
  .strict();

const ApiSchema = z
  .object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().min(1).max(65535).default(3000),
    token: z.string().min(1).optional(),
  })
  .strict();

const ConfigSchema = z
  .object({
    api: ApiSchema.default({}),
    proxy: ProxySchema,
  })
  .strict();

export function parseConfigInput(input: unknown): ConfigFile {
  return ConfigSchema.parse(input);
}

export async function loadConfigFile(configPath: string): Promise<ConfigFile> {
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return parseConfigInput(parsed);
}

export function applyEnvOverrides(config: ConfigFile, env: NodeJS.ProcessEnv = process.env): ConfigFile {
  const next: ConfigFile = {
    api: {
      ...config.api,
    },
    proxy: config.proxy,
  };

  if (env.PROXY_ROUTER_API_HOST) {
    next.api.host = env.PROXY_ROUTER_API_HOST;
  }

  if (env.PROXY_ROUTER_API_PORT) {
    const parsed = Number(env.PROXY_ROUTER_API_PORT);
    if (!Number.isNaN(parsed)) {
      next.api.port = parsed;
    }
  }

  if (env.PROXY_ROUTER_API_TOKEN) {
    next.api.token = env.PROXY_ROUTER_API_TOKEN;
  }

  return next;
}

export async function buildRuntimeConfig(
  config: ConfigFile,
  baseDir: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeConfig> {
  const merged = applyEnvOverrides(config, env);
  const api = resolveApiConfig(merged.api);
  const proxy = {
    listen: await resolveListen(merged.proxy.listen, baseDir),
    routes: merged.proxy.routes?.map(normalizeRoute) ?? [],
    verbose: merged.proxy.verbose ?? false,
    authRealm: merged.proxy.authRealm,
  };

  return { api, proxy };
}

function resolveApiConfig(api: ApiConfigInput): ApiRuntimeConfig {
  if (!api.token) {
    throw new Error('API token is required. Set api.token in the config file or PROXY_ROUTER_API_TOKEN.');
  }

  return {
    host: api.host ?? '0.0.0.0',
    port: api.port ?? 3000,
    token: api.token,
  };
}

async function resolveListen(listen: ListenConfigInput, baseDir: string): Promise<ProxyListenOptions> {
  const serverType = listen.serverType ?? 'http';

  if (serverType === 'https') {
    if (!listen.https) {
      throw new Error('HTTPS listen configuration requires https.keyFile and https.certFile.');
    }

    const keyPath = resolveFilePath(baseDir, listen.https.keyFile);
    const certPath = resolveFilePath(baseDir, listen.https.certFile);

    const httpsOptions = {
      key: await fs.readFile(keyPath),
      cert: await fs.readFile(certPath),
      passphrase: listen.https.passphrase,
      ca: listen.https.caFile ? await fs.readFile(resolveFilePath(baseDir, listen.https.caFile)) : undefined,
    };

    return {
      host: listen.host ?? '0.0.0.0',
      port: listen.port,
      serverType,
      httpsOptions,
    };
  }

  return {
    host: listen.host ?? '0.0.0.0',
    port: listen.port,
    serverType: 'http',
  };
}

function normalizeRoute(route: RouteRuleInput): RouteRule {
  return {
    name: route.name,
    match: route.match ? normalizeRouteMatch(route.match) : undefined,
    upstream: route.upstream,
  };
}

function normalizeRouteMatch(match: RouteMatchInput): RouteRule['match'] {
  return {
    domain: match.domain ? normalizeDomainMatcher(match.domain) : undefined,
    hostname: match.hostname ? normalizeDomainMatcher(match.hostname) : undefined,
    port: match.port,
    isHttp: match.isHttp,
    method: match.method,
  };
}

function normalizeDomainMatcher(input: DomainMatcherInput): DomainMatcher {
  if (typeof input === 'string') {
    return input;
  }

  return new RegExp(input.pattern, input.flags);
}

function resolveFilePath(baseDir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}
