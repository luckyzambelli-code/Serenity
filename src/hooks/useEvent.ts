import { useRef, useCallback } from 'react';

/**
 * CONN-121 (perf, stage 2): "useEvent" — returns a callback with a STABLE identity
 * that always invokes the LATEST version of `fn`. This lets us pass handlers to
 * React.memo'd children (Sidebar, SidebarDrawer) without breaking their memoization
 * (the prop identity never changes) AND without the stale-closure risk of a
 * useCallback dependency list (the body always sees fresh state/props).
 *
 * Safe for event handlers (invoked after render, never during it).
 */
export function useEvent<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn; // keep the freshest closure; handlers run post-render
  return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
}
