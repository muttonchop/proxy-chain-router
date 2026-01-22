import { AsyncMutex } from './utils/async-mutex.js';
import { ProxyInstance } from './proxy-instance.js';
import type { ProxyRuntimeConfig, ProxyStatus } from './types.js';

export class ProxyManager {
  private instance: ProxyInstance | null = null;
  private readonly mutex = new AsyncMutex();

  async applyConfig(config: ProxyRuntimeConfig): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.instance) {
        this.instance = new ProxyInstance(config);
        await this.instance.start();
        return;
      }

      await this.instance.update(config);
    });
  }

  getStatus(): ProxyStatus | null {
    return this.instance?.getStatus() ?? null;
  }

  async stop(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.instance) {
        await this.instance.stop(true);
      }

      this.instance = null;
    });
  }
}
