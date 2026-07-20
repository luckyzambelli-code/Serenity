/**
 * SessionRuntime — kernel-level state container, lives OUTSIDE React.
 *
 * Phase A of the architectural refactor: consolidate the dozens of useRef
 * "shadow refs" scattered across App.tsx into typed runtime objects with a
 * pub/sub interface. React components consume snapshots via
 * `useSyncExternalStore` (the React 18+ official API for external stores).
 *
 * The runtime owns:
 *   • physics loops (RAF)
 *   • smoothing / EMA filters
 *   • timers and locks
 *
 * React owns:
 *   • view tree (panels, dialogs, visuals)
 *   • user input handlers (which call runtime methods)
 *
 * No business logic lives in useEffect anymore — it lives in runtime methods.
 *
 * Design notes:
 *   • Subscribers are called on every notify(); they should be cheap
 *     (typically: a single getSnapshot read + selector compare).
 *   • Engines are framework-agnostic — they can be unit-tested with vitest
 *     without mounting React.
 */

/** Lightweight observer pattern shared by every engine in the runtime. */
export class Emitter {
  private subs = new Set<() => void>();

  /** Subscribe to change notifications. Returns the unsubscribe function. */
  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  };

  /** Notify all subscribers. Called by engine methods after state changes. */
  protected notify(): void {
    // Copy to a local array to be safe against re-entrant unsubscribe.
    const snapshot = Array.from(this.subs);
    for (let i = 0; i < snapshot.length; i++) snapshot[i]();
  }
}
