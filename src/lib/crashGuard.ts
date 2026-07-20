/**
 * R2 (robustness): global error guards. Catches errors and promise rejections that
 * escape React's render path (async handlers, event callbacks, worker glue) so they
 * are LOGGED instead of vanishing silently and leaving the app in a zombie state.
 *
 * Keeps a small ring buffer on `window.__smCrashLog` that both the ErrorBoundary and
 * a future "export logs" action can read. Pure logging — never throws, never blocks.
 */
export interface CrashEntry {
  t: number;
  kind: 'error' | 'unhandledrejection' | 'render';
  message: string;
  stack?: string;
  componentStack?: string;
}

const MAX = 50;

export function installCrashGuard(): void {
  const w = window as any;
  if (w.__smCrashGuardInstalled) return;
  w.__smCrashGuardInstalled = true;

  const buf: CrashEntry[] = w.__smCrashLog || (w.__smCrashLog = []);
  const push = (e: CrashEntry) => { buf.push(e); if (buf.length > MAX) buf.splice(0, buf.length - MAX); };

  window.addEventListener('error', (ev: ErrorEvent) => {
    // Ignore benign ResizeObserver noise that some browsers emit.
    if (ev?.message && ev.message.includes('ResizeObserver loop')) return;
    push({ t: Date.now(), kind: 'error', message: ev?.message || 'unknown error', stack: ev?.error?.stack });
    console.error('[crashGuard] window error:', ev?.message, ev?.error || '');
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason: any = ev?.reason;
    const message = (reason && (reason.message || String(reason))) || 'unhandled rejection';
    push({ t: Date.now(), kind: 'unhandledrejection', message, stack: reason?.stack });
    console.error('[crashGuard] unhandled rejection:', message, reason || '');
  });
}

/** Snapshot of the captured crash entries (for an "export logs" action). */
export function getCrashLog(): CrashEntry[] {
  try { return [ ...((window as any).__smCrashLog || []) ]; } catch { return []; }
}
