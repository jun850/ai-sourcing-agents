import type { MotionProps } from "framer-motion";

/**
 * Atelix motion contract
 *
 * This module is intentionally declarative. It centralises the values already
 * used by the landing page so section components can migrate to named presets
 * without inventing new timing, easing, or reduced-motion behavior.
 *
 * Important: the current page uses CSS for the sticky header, drawer, marquee,
 * tracking artwork, and network chart. The CSS values below are a source of
 * truth for that migration; they do not inject or replace CSS by themselves.
 */

export const motionDurations = {
  micro: 0.18,
  state: 0.22,
  component: 0.28,
  drawer: 0.24,
  modal: 0.2,
  narrative: 0.7,
  narrativeLong: 0.9,
  ambientSeconds: 34,
} as const;

export const motionEasings = {
  header: [0.2, 0.8, 0.2, 1] as const,
  easeOut: [0.22, 1, 0.36, 1] as const,
} as const;

export const motionViewports = {
  section: { once: true, amount: 0.3 },
  feature: { once: true, amount: 0.2 },
  chat: { once: true },
} as const;

/**
 * A safe final state for reduced-motion mode. Components should render this
 * state directly, not wait for an in-view callback to make content readable.
 */
export const reducedMotion = {
  initial: false,
  animate: { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 },
  transition: { duration: 0 },
} as const satisfies Pick<MotionProps, "initial" | "animate" | "transition">;

/** Existing sticky-header compaction values from sticky-nav.css. */
export const headerCompactionMotion = {
  expanded: { scale: 1 },
  compact: { scale: 0.75 },
  compactMobile: { scale: 0.86 },
  transition: {
    transform: `transform ${0.32}s cubic-bezier(.2,.8,.2,1)`,
    shadow: `box-shadow ${0.32}s ease`,
  },
  scrollThresholdPx: 80,
} as const;

/** Existing navigation-child CSS transition, including its layout values. */
export const headerChildrenMotion = {
  opacity: motionDurations.micro,
  width: 0.28,
  padding: 0.28,
  margin: 0.28,
  borderWidth: motionDurations.micro,
  easing: motionEasings.header,
} as const;

/**
 * Section heading reveal currently used by AtelixSourcingSection.
 * `hidden` is the existing animated starting state; `visible` is the safe DOM
 * state used when motion is reduced or an in-view trigger is unavailable.
 */
export const sectionRevealMotion = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: motionViewports.section,
  transition: {
    duration: motionDurations.component,
    ease: motionEasings.easeOut,
  },
  reduced: reducedMotion,
} as const satisfies Pick<
  MotionProps,
  "initial" | "whileInView" | "viewport" | "transition"
> & { hidden: object; visible: object; reduced: typeof reducedMotion };

/** Existing five-step journey scroll and checkpoint ranges. */
export const journeyMotion = {
  stage: {
    offset: ["start 87%", "end 47%"] as const,
  },
  railSpring: {
    stiffness: 110,
    damping: 28,
    mass: 0.22,
  },
  card: {
    offset: ["start 94%", "end 30%"] as const,
    opacityInput: [0, 0.18, 0.78, 1] as const,
    opacityOutput: [0.2, 1, 1, 0.2] as const,
  },
  checkpoint: {
    centerOffset: 0.1,
    borderInput: [0, 1] as const,
    borderOutput: ["#c8d0ca", "#7fb879"] as const,
    fillOutput: ["#e1e6e2", "#7fb879"] as const,
    scaleOutput: [0.62, 1] as const,
  },
  reduced: {
    card: { opacity: 1, transform: "none" },
    railScaleY: 1,
    dotBorder: "#7fb879",
    dotFill: "#7fb879",
    dotScale: 1,
  },
} as const;

/** Existing chat prompt and matching-result entrance choreography. */
export const chatPromptMotion = {
  prompt: {
    initial: { opacity: 0, y: 10 },
    whileInView: { opacity: 1, y: 0 },
    viewport: motionViewports.chat,
    transition: {
      duration: motionDurations.component,
      ease: motionEasings.easeOut,
    },
  },
  results: {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: motionViewports.chat,
    transition: {
      duration: motionDurations.component,
      delay: 0.12,
      ease: motionEasings.easeOut,
    },
  },
  reduced: reducedMotion,
} as const;

export function supplierRowMotion(index: number, reduced = false) {
  return {
    initial: reduced ? false : { opacity: 0, x: 20 },
    whileInView: reduced ? undefined : { opacity: 1, x: 0 },
    viewport: motionViewports.chat,
    transition: {
      duration: motionDurations.component,
      delay: reduced ? 0 : 0.18 + index * 0.08,
      ease: motionEasings.easeOut,
    },
  } as const;
}

export function featureRevealMotion(index: number, reduced = false) {
  return {
    initial: reduced ? false : { opacity: 0, y: 28 },
    whileInView: reduced ? undefined : { opacity: 1, y: 0 },
    viewport: motionViewports.feature,
    transition: {
      duration: motionDurations.component,
      delay: reduced ? 0 : index * 0.08,
      ease: motionEasings.easeOut,
    },
  } as const;
}

/** Existing tracking artwork hover/focus state from atelix-sourcing-section.css. */
export const trackingArtworkMotion = {
  rest: { rotate: 0, y: -6 },
  active: { rotate: -2, y: 0 },
  whileHover: { rotate: -2, y: 0 },
  whileFocus: { rotate: -2, y: 0 },
  transition: {
    duration: motionDurations.state,
    ease: motionEasings.easeOut,
  },
  signal: {
    rest: { scale: 1.08 },
    active: { scale: 1 },
    duration: motionDurations.micro,
  },
  bars: {
    rest: { scaleX: 1 },
    active: { scaleX: 0.72 },
    scanDuration: 0.48,
    scanDelays: [0, 0.07, 0.14] as const,
  },
  reduced: {
    rest: { rotate: 0, y: -6 },
    transition: { duration: 0 },
  },
} as const satisfies Pick<
  MotionProps,
  "whileHover" | "whileFocus" | "transition"
> & {
  rest: object;
  active: object;
  signal: object;
  bars: object;
  reduced: object;
};

/**
 * Canonical chart state for the existing CSS artwork. The chart is deliberately
 * quiet at rest and complete on hover/focus. `fill: none` is a hard invariant:
 * the trend is a line, never a filled polygon.
 */
export const networkChartMotion = {
  rest: {
    lineOpacity: 0.22,
    lineDashOffset: 205,
    barScaleY: 0.42,
    overlayOpacity: 0,
  },
  active: {
    lineOpacity: 1,
    lineDashOffset: 0,
    barScaleY: 1,
    overlayOpacity: 1,
  },
  transition: {
    lineOpacity: 0.42,
    lineDraw: 0.52,
    bar: 0.52,
    easing: motionEasings.easeOut,
    barStagger: 0.05,
  },
  svg: {
    fill: "none",
    vectorEffect: "non-scaling-stroke",
  },
  reduced: {
    lineOpacity: 0.22,
    lineDashOffset: 205,
    barScaleY: 0.42,
    overlayOpacity: 1,
    transition: { duration: 0 },
  },
} as const;

/** Mobile/tablet drawer values from responsive-a11y.css. */
export const drawerMotion = {
  breakpointMaxPx: 900,
  scrim: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    duration: motionDurations.state,
  },
  panel: {
    hidden: { opacity: 0, x: 18 },
    visible: { opacity: 1, x: 0 },
    enterDuration: motionDurations.drawer,
    exitDuration: motionDurations.micro,
    easing: motionEasings.easeOut,
  },
  reduced: {
    scrim: { opacity: 1 },
    panel: { opacity: 1, x: 0 },
    transition: { duration: 0 },
  },
} as const;

/** Supplier-intake modal values from supplier-intake.tsx. */
export const modalMotion = {
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  dialog: {
    initial: { y: 18, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 12, scale: 0.985 },
  },
  transition: {
    duration: motionDurations.modal,
    ease: motionEasings.easeOut,
  },
  reduced: {
    initial: false,
    exit: undefined,
    transition: { duration: 0 },
  },
} as const;

/**
 * Existing conditional export-region transition. This is retained verbatim
 * for compatibility, but height/auto is a layout animation and should not be
 * copied into new components. Prefer an opacity/clip or grid-row migration when
 * this form is refactored.
 */
export const conditionalFieldMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: {
    duration: motionDurations.component,
    ease: motionEasings.easeOut,
  },
  layoutProperty: "height",
  legacyLayoutAnimation: true,
  reduced: {
    initial: false,
    exit: undefined,
    transition: { duration: 0 },
  },
} as const;

/** CSS-only contracts for the current landing motion layer. */
export const cssMotion = {
  header: {
    transition:
      "transform 320ms cubic-bezier(.2,.8,.2,1), box-shadow 320ms ease",
    compactDesktop: "scale(.75)",
    compactMobile: "scale(.86)",
    scrollThreshold: "window.scrollY > 80",
  },
  brandRail: {
    duration: "34s",
    easing: "linear",
    interaction: "pause on hover and focus-within",
    reduced: "animation: none; transform: none",
  },
  tracking: {
    transform:
      "transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms ease",
    scan: "480ms cubic-bezier(.22,1,.36,1)",
    reduced: "animation: none; transition: none",
  },
  networkChart: {
    line:
      "opacity 420ms ease, stroke-dashoffset 520ms cubic-bezier(.22,1,.36,1), stroke-width 180ms ease",
    surface: "background 220ms ease, box-shadow 220ms ease",
    bar: "520ms cubic-bezier(.22,1,.36,1)",
    reduced: "animation: none; transition: none",
  },
  drawer: {
    scrim:
      "opacity 220ms ease, visibility 0s linear 220ms",
    panel:
      "transform 240ms cubic-bezier(.22,1,.36,1), opacity 180ms ease, visibility 0s linear 240ms",
    reduced: "transition: none",
  },
} as const;

export type AtelixMotionContract = {
  durations: typeof motionDurations;
  easings: typeof motionEasings;
  reducedMotion: typeof reducedMotion;
  header: typeof headerCompactionMotion;
  journey: typeof journeyMotion;
  chat: typeof chatPromptMotion;
  tracking: typeof trackingArtworkMotion;
  networkChart: typeof networkChartMotion;
  drawer: typeof drawerMotion;
  modal: typeof modalMotion;
};

export const atelixMotionContract: AtelixMotionContract = {
  durations: motionDurations,
  easings: motionEasings,
  reducedMotion,
  header: headerCompactionMotion,
  journey: journeyMotion,
  chat: chatPromptMotion,
  tracking: trackingArtworkMotion,
  networkChart: networkChartMotion,
  drawer: drawerMotion,
  modal: modalMotion,
};

/**
 * Compatibility names used by the in-progress landing migration. Keep these
 * aliases small and value-based so section components can consume the contract
 * without importing implementation-specific variants.
 */
export const landingMotion = {
  journeySpring: journeyMotion.railSpring,
  sectionReveal: sectionRevealMotion.transition,
  chatRow: {
    duration: motionDurations.component,
    ease: motionEasings.easeOut,
  },
  cardReveal: {
    duration: motionDurations.component,
    ease: motionEasings.easeOut,
  },
} as const;
