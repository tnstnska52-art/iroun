type BackOptions = {
  send: (requestId: string, deadline: number) => void;
  fallback: () => void;
  onTimeout: () => void;
  timeoutMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
};

/** One hardware press can cause at most one web or native navigation. */
export function createPortalBackController(options: BackOptions) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 1200;
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  });
  let serial = 0;
  let pending: { id: string; deadline: number; cancelTimer: () => void } | null = null;

  function cancel() {
    pending?.cancelTimer();
    pending = null;
  }

  function expire(id: string) {
    if (pending?.id !== id) return;
    cancel();
    // A missing acknowledgement is not permission to discard a form or exit the app.
    options.onTimeout();
  }

  return {
    request() {
      if (pending) return pending.id;
      const id = `back-${now()}-${++serial}`;
      const deadline = now() + timeoutMs;
      pending = { id, deadline, cancelTimer: () => undefined };
      pending.cancelTimer = schedule(() => expire(id), timeoutMs);
      try { options.send(id, deadline); } catch { expire(id); }
      return id;
    },
    receive(message: unknown) {
      if (!message || typeof message !== 'object') return false;
      const value = message as { type?: unknown; requestId?: unknown; handled?: unknown };
      if (value.type !== 'app-back-result' || typeof value.handled !== 'boolean' || !pending || value.requestId !== pending.id) return false;
      if (now() > pending.deadline) { expire(pending.id); return false; }
      const handled = value.handled;
      cancel();
      if (!handled) options.fallback();
      return true;
    },
    cancel,
  };
}
