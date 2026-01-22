import { Server, type PrepareRequestFunctionOpts, redactUrl } from 'proxy-chain';

import { normalizeMethod, selectRoute, selectUpstream } from './routing.js';
import type { ProxyMetrics, ProxyRuntimeConfig, ProxyStatus, RequestInfo, RouteRule } from './types.js';

const DIRECT_KEY = 'direct';

export class ProxyInstance {
  private server: Server | null = null;
  private address: string | null = null;
  private config: ProxyRuntimeConfig;
  private cursors = new Map<RouteRule, number>();
  private readonly metrics: ProxyMetrics = {
    totalRequests: 0,
    totalErrors: 0,
    upstreamRequests: {},
    startedAt: null,
  };

  constructor(config: ProxyRuntimeConfig) {
    this.config = config;
    this.resetCursors();
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    if (this.config.listen.serverType === 'https') {
      const httpsOptions = this.config.listen.httpsOptions;
      if (!httpsOptions) {
        throw new Error('HTTPS server requires httpsOptions.');
      }

      this.server = new Server({
        port: this.config.listen.port,
        host: this.config.listen.host,
        serverType: 'https' as const,
        httpsOptions,
        verbose: this.config.verbose,
        authRealm: this.config.authRealm,
        prepareRequestFunction: this.handlePrepareRequest,
      });
    } else {
      this.server = new Server({
        port: this.config.listen.port,
        host: this.config.listen.host,
        serverType: 'http' as const,
        verbose: this.config.verbose,
        authRealm: this.config.authRealm,
        prepareRequestFunction: this.handlePrepareRequest,
      });
    }

    this.server.on('requestFailed', ({ error }) => {
      this.metrics.totalErrors += 1;
      this.metrics.lastError = error.message;
      this.metrics.lastErrorAt = new Date().toISOString();
    });

    await this.server.listen();
    this.address = `${this.config.listen.serverType}://${this.config.listen.host}:${this.server.port}`;
    this.metrics.startedAt = new Date().toISOString();
  }

  async stop(closeConnections = false): Promise<void> {
    if (!this.server) {
      return;
    }

    await this.server.close(closeConnections);
    this.server = null;
    this.address = null;
    this.metrics.startedAt = null;
  }

  async update(nextConfig: ProxyRuntimeConfig): Promise<void> {
    const restartRequired = this.needsRestart(nextConfig);
    this.config = nextConfig;

    if (restartRequired && this.server) {
      await this.stop(true);
      await this.start();
      return;
    }

    if (!this.server) {
      await this.start();
      return;
    }

    this.resetCursors();
  }

  getStatus(): ProxyStatus {
    return {
      running: this.server !== null,
      listen: this.config.listen,
      address: this.address ?? undefined,
      metrics: { ...this.metrics },
    };
  }

  private resetCursors(): void {
    this.cursors = new Map<RouteRule, number>();
    for (const route of this.config.routes) {
      this.cursors.set(route, 0);
    }
  }

  private needsRestart(nextConfig: ProxyRuntimeConfig): boolean {
    if (!this.server) {
      return true;
    }

    if (this.config.listen.host !== nextConfig.listen.host) {
      return true;
    }

    if (this.config.listen.port !== nextConfig.listen.port) {
      return true;
    }

    if (this.config.listen.serverType !== nextConfig.listen.serverType) {
      return true;
    }

    if (this.config.listen.httpsOptions !== nextConfig.listen.httpsOptions) {
      return true;
    }

    if (this.config.verbose !== nextConfig.verbose) {
      return true;
    }

    if (this.config.authRealm !== nextConfig.authRealm) {
      return true;
    }

    return false;
  }

  private handlePrepareRequest = async (
    opts: PrepareRequestFunctionOpts,
  ): Promise<{ upstreamProxyUrl?: string | null }> => {
    const info: RequestInfo = {
      connectionId: opts.connectionId,
      hostname: opts.hostname,
      port: opts.port,
      isHttp: opts.isHttp,
      method: normalizeMethod(opts.request.method),
      url: opts.request.url ?? '',
      username: opts.username,
      password: opts.password,
    };

    this.metrics.totalRequests += 1;

    const route = selectRoute(this.config.routes, info);
    const upstream = selectUpstream(route, this.cursors);

    const metricsKey = upstream ? redactUpstream(upstream) : DIRECT_KEY;
    this.metrics.upstreamRequests[metricsKey] = (this.metrics.upstreamRequests[metricsKey] ?? 0) + 1;

    if (upstream === undefined) {
      return {};
    }

    return { upstreamProxyUrl: upstream };
  };
}

function redactUpstream(upstream: string): string {
  try {
    return redactUrl(upstream);
  } catch {
    return upstream;
  }
}
