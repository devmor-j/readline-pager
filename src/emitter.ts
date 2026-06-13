export function createEventEmitter<E extends EventMapBase>(
  options: EventEmitterOptions = {},
) {
  const { awaitListeners = true, parallel = false } = options;

  const listeners = new Map<keyof E, Set<(...args: any[]) => any>>();

  function on<K extends keyof E>(event: K, fn: E[K]) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(fn as (...args: any[]) => any);
  }

  async function emit<K extends keyof E>(
    event: K,
    ...args: Parameters<E[K]>
  ): Promise<void> {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;

    const fns = Array.from(set) as E[K][];

    if (!awaitListeners) {
      for (const fn of fns) {
        fn(...args);
      }
      return;
    }

    if (parallel) {
      await Promise.all(fns.map((fn) => fn(...args)));
    } else {
      for (const fn of fns) {
        await fn(...args);
      }
    }
  }

  function emitSync<K extends keyof E>(event: K, ...args: Parameters<E[K]>) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;

    for (const fn of set) {
      fn(...(args as any[]));
    }
  }

  function clear() {
    listeners.clear();
  }

  return {
    on,
    emit,
    emitSync,
    clear,
  };
}
