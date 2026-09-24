import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Meta } from "./api";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => id === seq.current && setState({ data, error: null, loading: false }),
      (err: Error) => id === seq.current && setState((s) => ({ ...s, error: err.message, loading: false })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

let metaPromise: Promise<Meta> | null = null;
export function useMeta() {
  return useAsync(() => (metaPromise ??= api.meta().catch((e) => ((metaPromise = null), Promise.reject(e)))), []);
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · FreeRank` : "FreeRank — hire the rank, not the hype";
  }, [title]);
}
