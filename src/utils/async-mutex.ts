export class AsyncMutex {
  private current: Promise<void> = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    let release: () => void;

    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = this.current;
    this.current = this.current.then(() => ready);

    await previous;

    try {
      return await task();
    } finally {
      release!();
    }
  }
}
