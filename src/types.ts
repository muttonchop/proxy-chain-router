import type https from 'node:https';

export type DomainMatcher = string | RegExp;

export type RouteMatch = {
  domain?: DomainMatcher;
  hostname?: DomainMatcher;
  port?: number | number[];
  isHttp?: boolean;
  method?: string | string[];
};

export type RouteRule = {
  name?: string;
  match?: RouteMatch;
  upstream?: string | string[] | null;
};

export type RequestInfo = {
  connectionId: number;
  hostname: string;
  port: number;
  isHttp: boolean;
  method: string;
  url: string;
  username: string;
  password: string;
};

export type ProxyListenOptions = {
  host: string;
  port: number;
  serverType: 'http' | 'https';
  httpsOptions?: https.ServerOptions;
};

export type ProxyRuntimeConfig = {
  listen: ProxyListenOptions;
  routes: RouteRule[];
  verbose: boolean;
  authRealm?: string;
};

export type ProxyStatus = {
  running: boolean;
  listen: ProxyListenOptions;
  address?: string;
  metrics: ProxyMetrics;
};

export type ProxyMetrics = {
  totalRequests: number;
  totalErrors: number;
  upstreamRequests: Record<string, number>;
  startedAt: string | null;
  lastError?: string;
  lastErrorAt?: string;
};
