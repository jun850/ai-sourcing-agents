import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Box, Button, Skeleton, Stack, Typography } from "@mui/material";

export type WorkspaceScrollPane = "navigation" | "main" | "list" | "thread";

export function useIntentScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  key: string,
  options: { toEnd?: boolean; behavior?: ScrollBehavior } = {},
) {
  const firstRender = useRef(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (options.toEnd) {
      const nearEnd = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
      if (!firstRender.current && !nearEnd) return;
      node.scrollTo({
        top: node.scrollHeight,
        behavior: options.behavior ?? "auto",
      });
    } else if (firstRender.current) {
      node.scrollTo({ top: 0, behavior: "auto" });
    }
    firstRender.current = false;
  }, [key, options.behavior, options.toEnd, ref]);
}

export function WorkspaceShell({
  navigation,
  header,
  children,
  mobileNavigation,
  navigationOpen = false,
}: {
  navigation: ReactNode;
  header: ReactNode;
  children: ReactNode;
  mobileNavigation?: ReactNode;
  navigationOpen?: boolean;
}) {
  return (
    <Box className="workspace-shell" data-navigation-open={navigationOpen || undefined}>
      <aside className="workspace-shell__navigation" aria-label="Workspace navigation">
        {navigation}
      </aside>
      {mobileNavigation}
      <section className="workspace-shell__main">
        <header className="workspace-shell__header">{header}</header>
        <main className="workspace-shell__content" id="main-content">
          {children}
        </main>
      </section>
    </Box>
  );
}

export function QueueSkeleton({ rows = 6, compact = false }: { rows?: number; compact?: boolean }) {
  return (
    <Stack className="workspace-queue-skeleton" spacing={0} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Box className="workspace-queue-skeleton__row" key={index}>
          <Skeleton variant="rounded" width={compact ? 28 : 36} height={compact ? 28 : 36} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={`${42 + (index % 3) * 14}%`} height={18} />
            <Skeleton width={`${58 + (index % 2) * 17}%`} height={14} />
          </Box>
          <Skeleton width={compact ? 48 : 78} height={18} />
        </Box>
      ))}
    </Stack>
  );
}

export function AppendSkeleton({ rows = 2 }: { rows?: number }) {
  return <QueueSkeleton rows={rows} compact />;
}

export function QueueEndState({ label = "You’ve reached the end of this queue." }: { label?: string }) {
  return <Typography className="workspace-queue-end" role="status">{label}</Typography>;
}

export function QueueRetry({ onRetry, label = "Retry loading this queue" }: { onRetry: () => void; label?: string }) {
  return (
    <Box className="workspace-queue-retry" role="alert">
      <Typography>We couldn’t load the next records.</Typography>
      <Button size="small" variant="outlined" onClick={onRetry}>{label}</Button>
    </Box>
  );
}
