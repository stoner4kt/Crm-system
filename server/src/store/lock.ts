// Minimal async mutex so in-memory store mutations are serialized even when
// handlers run concurrently. Supports re-entrancy: nested run() calls from the
// lock holder (e.g. convertLeadToClient -> createClient/createProject) execute
// immediately instead of deadlocking.
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  private depth = 0;

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    if (this.depth > 0) {
      this.depth++;
      try {
        return await fn();
      } finally {
        this.depth--;
      }
    }

    let release!: () => void;
    const prev = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    this.depth = 1;
    try {
      return await fn();
    } finally {
      this.depth = 0;
      release();
    }
  }
}