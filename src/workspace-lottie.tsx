import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import lottie from "lottie-web/build/player/lottie_light";
import type { AnimationItem } from "lottie-web";

/**
 * Self-hosted Lottie player for the Home "composing a brief" illustration.
 * Decorative only (aria-hidden). Under reduced motion the animation is loaded
 * paused on a representative frame instead of looping.
 */
export function WorkspaceLottie({
  src = "/assets/lottie/idea-innovation.json",
  size = 420,
}: {
  src?: string;
  size?: number;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let animation: AnimationItem | null = null;
    let cancelled = false;

    void fetch(src)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || !container.current) return;
        animation = lottie.loadAnimation({
          container: container.current,
          renderer: "svg",
          loop: !reduceMotion,
          autoplay: !reduceMotion,
          animationData: data,
          rendererSettings: { progressiveLoad: true },
        });
        if (reduceMotion) {
          animation.goToAndStop(Math.floor(animation.totalFrames * 0.5), true);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [src, reduceMotion]);

  return (
    <div
      ref={container}
      aria-hidden="true"
      style={{ width: size, height: size, maxWidth: "100%", pointerEvents: "none" }}
    />
  );
}
