import { useCallback, useEffect, useRef, useState } from "react";

export type ListCursor = { updatedAt: string; id: string };
export type CursorPage<T> = {
  items: T[];
  nextCursor: ListCursor | null;
  hasMore: boolean;
};

type Loader<T> = (options: {
  cursor: ListCursor | null;
  signal: AbortSignal;
}) => Promise<CursorPage<T>>;

export function useInfiniteList<T extends { id: string }>(
  key: string,
  loadPage: Loader<T>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<ListCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async (append: boolean) => {
    if (inFlightRef.current || (append && !hasMore)) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    inFlightRef.current = true;
    setError(null);
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const page = await loadPage({ cursor: append ? cursor : null, signal: controller.signal });
      if (controller.signal.aborted) return;
      setItems((current) => {
        const source = append ? [...current, ...page.items] : page.items;
        return Array.from(new Map(source.map((item) => [item.id, item])).values());
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load the queue.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
      inFlightRef.current = false;
    }
  }, [cursor, hasMore, loadPage]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    void load(false);
    return () => requestRef.current?.abort();
    // key deliberately resets the list when route/filter state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    reload: () => load(false),
    loadMore: () => load(true),
  };
}
