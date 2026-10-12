// A small FIFO semaphore for the scanner process. Waiting callers do not own a
// slot until granted; canceled/timed-out callers are removed without affecting
// the active scan.
export class ScanQueue {
  #active = 0;
  #waiters = [];

  constructor({ maxActive = 1, maxQueued = 3, waitMs = 45_000 } = {}) {
    if (!Number.isInteger(maxActive) || maxActive < 1) throw new RangeError("maxActive must be a positive integer");
    if (!Number.isInteger(maxQueued) || maxQueued < 0) throw new RangeError("maxQueued must be a non-negative integer");
    if (!Number.isFinite(waitMs) || waitMs < 0) throw new RangeError("waitMs must be a non-negative number");
    this.maxActive = maxActive;
    this.maxQueued = maxQueued;
    this.waitMs = waitMs;
  }

  get busy() {
    return this.#active > 0;
  }

  get queued() {
    return this.#waiters.length;
  }

  acquire(signal) {
    if (signal?.aborted) return Promise.resolve(null);
    if (this.#active < this.maxActive) return Promise.resolve(this.#createLease());
    if (this.#waiters.length >= this.maxQueued) return Promise.resolve(null);

    return new Promise((resolve) => {
      const waiter = { resolve, settled: false, timer: undefined, onAbort: undefined };
      const cleanup = () => {
        clearTimeout(waiter.timer);
        if (waiter.onAbort) signal?.removeEventListener("abort", waiter.onAbort);
        const index = this.#waiters.indexOf(waiter);
        if (index >= 0) this.#waiters.splice(index, 1);
      };
      const settle = (lease) => {
        if (waiter.settled) return;
        waiter.settled = true;
        cleanup();
        resolve(lease);
      };
      waiter.settle = settle;
      waiter.onAbort = () => settle(null);
      this.#waiters.push(waiter);
      waiter.timer = setTimeout(() => settle(null), this.waitMs);
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      // Recheck after listener installation so an already-aborted signal cannot
      // remain parked in the FIFO.
      if (signal?.aborted) settle(null);
    });
  }

  #createLease() {
    this.#active += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.#active -= 1;
        this.#dispatch();
      },
    };
  }

  #dispatch() {
    while (this.#active < this.maxActive && this.#waiters.length > 0) {
      const waiter = this.#waiters.shift();
      if (waiter.settled) continue;
      // The queue entry has already been shifted; settle() also clears its timer
      // and abort listener, and grants exactly one lease.
      waiter.settle(this.#createLease());
    }
  }
}
