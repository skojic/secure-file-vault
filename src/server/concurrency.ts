// A counting semaphore: at most `limit` tasks run at once; the rest wait in order.
import "server-only";

export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  // Highest number of tasks seen running at once; read by tests (F6).
  peak = 0;

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
