export function createPageQueue() {
  const queue: string[][] = [];
  let resolver: (() => void) | null = null;

  return {
    queue,
    push(page: string[]) {
      queue.push(page);
      resolver?.();
      resolver = null;
    },
    wake() {
      resolver?.();
      resolver = null;
    },
    async shift(done: () => boolean) {
      if (queue.length) return queue.shift()!;
      if (done()) return null;

      await new Promise<void>((r) => (resolver = r));

      if (queue.length) return queue.shift()!;
      if (done()) return null;
      return null;
    },
  };
}

export function createRingBuffer<T>(capacity: number) {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new RangeError("capacity must be a positive number");
  }

  const buf: Array<T | undefined> = new Array(capacity);
  let head = 0;
  let tail = 0;
  let count = 0;
  let waiter: (() => void) | null = null;

  function push(item: T) {
    if (count === buf.length) {
      buf[tail] = item;

      tail++;
      if (tail === capacity) tail = 0;

      head = tail;
      return;
    }

    buf[tail] = item;

    tail++;
    if (tail === capacity) tail = 0;

    count++;

    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  }

  function shiftSync(): T | null {
    if (count === 0) return null;

    const v = buf[head]!;
    buf[head] = undefined;

    head++;
    if (head === capacity) head = 0;

    count--;
    return v;
  }

  async function shift(done = false): Promise<T | null> {
    if (count) return shiftSync();
    if (done) return null;

    await new Promise<void>((r) => (waiter = r));

    if (count) return shiftSync();
    if (done) return null;
    return null;
  }

  function wake() {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  }

  function clear() {
    for (let i = 0; i < buf.length; i++) buf[i] = undefined;
    head = 0;
    tail = 0;
    count = 0;

    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  }

  return {
    push,
    shift,
    shiftSync,
    wake,
    clear,
    get count() {
      return count;
    },
    get capacity() {
      return buf.length;
    },
  };
}
