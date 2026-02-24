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
