export function createRingBuffer<T>(capacity: number) {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new RangeError("capacity must be a positive number");
  }

  let buf: Array<T | undefined> = new Array(capacity);
  let head = 0;
  let tail = 0;
  let count = 0;

  let consumerWaiter: (() => void) | null = null;
  let producerWaiter: (() => void) | null = null;

  function push(item: T) {
    if (count === buf.length) {
      const newCap = buf.length * 2;
      const newBuf: Array<T | undefined> = new Array(newCap);

      for (let i = 0; i < count; i++) {
        newBuf[i] = buf[(head + i) % buf.length];
      }

      buf = newBuf;
      head = 0;
      tail = count;
    }

    buf[tail] = item;
    tail++;
    if (tail === buf.length) tail = 0;
    count++;

    if (consumerWaiter) {
      const w = consumerWaiter;
      consumerWaiter = null;
      w();
    }
  }

  function shiftSync(): T | null {
    if (count === 0) return null;

    const v = buf[head]!;
    buf[head] = undefined;

    head++;
    if (head === buf.length) head = 0;

    count--;

    if (producerWaiter) {
      const w = producerWaiter;
      producerWaiter = null;
      w();
    }

    return v;
  }

  async function shift(done: boolean): Promise<T | null> {
    if (count) return shiftSync();
    if (done) return null;

    await new Promise<void>((r) => {
      consumerWaiter = r;
    });

    if (count) return shiftSync();
    return null;
  }

  function wake() {
    if (consumerWaiter) {
      const w = consumerWaiter;
      consumerWaiter = null;
      w();
    }

    if (producerWaiter) {
      const w = producerWaiter;
      producerWaiter = null;
      w();
    }
  }

  function clear() {
    for (let i = 0; i < buf.length; i++) buf[i] = undefined;
    head = 0;
    tail = 0;
    count = 0;

    wake();
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
