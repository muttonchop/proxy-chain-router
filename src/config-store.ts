import fs from 'node:fs/promises';
import path from 'node:path';

import { buildRuntimeConfig, loadConfigFile, parseConfigInput } from './config.js';
import type { ConfigFile, RuntimeConfig } from './config.js';
import { AsyncMutex } from './utils/async-mutex.js';

export class ConfigStore {
  private config: ConfigFile | null = null;
  private runtime: RuntimeConfig | null = null;
  private readonly mutex = new AsyncMutex();

  constructor(readonly configPath: string, private readonly env: NodeJS.ProcessEnv = process.env) {}

  async load(): Promise<RuntimeConfig> {
    return this.mutex.runExclusive(async () => {
      const config = await loadConfigFile(this.configPath);
      const runtime = await buildRuntimeConfig(config, this.baseDir, this.env);
      this.config = config;
      this.runtime = runtime;
      return runtime;
    });
  }

  async reload(): Promise<RuntimeConfig> {
    return this.load();
  }

  async save(config: ConfigFile): Promise<RuntimeConfig> {
    return this.mutex.runExclusive(async () => {
      const normalized = parseConfigInput(config);
      await this.writeFile(normalized);
      const runtime = await buildRuntimeConfig(normalized, this.baseDir, this.env);
      this.config = normalized;
      this.runtime = runtime;
      return runtime;
    });
  }

  getConfig(): ConfigFile {
    if (!this.config) {
      throw new Error('ConfigStore has not been loaded yet.');
    }

    return this.config;
  }

  getRuntime(): RuntimeConfig {
    if (!this.runtime) {
      throw new Error('ConfigStore has not been loaded yet.');
    }

    return this.runtime;
  }

  get baseDir(): string {
    return path.dirname(this.configPath);
  }

  private async writeFile(config: ConfigFile): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${this.configPath}.tmp`;
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, this.configPath);
  }
}
