import { useEffect, useState } from "react";

// recharts is a heavy library, so it is loaded with a runtime dynamic
// `import()` (its own async chunk) instead of a static top-level import. The
// hook returns the module once loaded, or null while loading.
type RechartsModule = typeof import("recharts");

let cached: RechartsModule | null = null;
let pending: Promise<RechartsModule> | null = null;

function loadRecharts(): Promise<RechartsModule> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = import("recharts").then((mod) => {
      cached = mod;
      return mod;
    });
  }
  return pending;
}

export function useRecharts(): RechartsModule | null {
  const [mod, setMod] = useState<RechartsModule | null>(cached);

  useEffect(() => {
    if (mod) return;
    let cancelled = false;
    loadRecharts().then((loaded) => {
      if (!cancelled) setMod(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [mod]);

  return mod;
}
