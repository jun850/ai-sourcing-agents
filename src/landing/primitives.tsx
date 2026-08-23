import { motion, useReducedMotion } from "framer-motion";
import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type SurfaceVariant = "plain" | "tinted" | "glass";
export type ActionButtonVariant = "primary" | "secondary" | "ghost";
export type ActionButtonSize = "regular" | "compact";

type ClassNameProps = {
  className?: string;
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export type PageContainerProps = HTMLAttributes<HTMLDivElement> & ClassNameProps;

export function PageContainer({ className, children, ...props }: PageContainerProps) {
  return (
    <div className={joinClasses("atelix-page-container", className)} {...props}>
      {children}
    </div>
  );
}

export type SectionProps = HTMLAttributes<HTMLElement> & ClassNameProps;

export function Section({ className, children, ...props }: SectionProps) {
  return (
    <section className={joinClasses("atelix-section", className)} {...props}>
      {children}
    </section>
  );
}

export type SectionHeadingProps = ClassNameProps & {
  title: ReactNode;
  emphasis?: ReactNode;
  description?: ReactNode;
  id?: string;
  level?: 2 | 3 | 4;
};

export function SectionHeading({
  className,
  title,
  emphasis,
  description,
  id,
  level = 2,
}: SectionHeadingProps) {
  const Heading = level === 4 ? "h4" : level === 3 ? "h3" : "h2";

  return (
    <header className={joinClasses("atelix-section-heading", className)}>
      <Heading id={id} className="atelix-section-heading__title">
        {title}
        {emphasis ? <> <em>{emphasis}</em></> : null}
      </Heading>
      {description ? <p className="atelix-section-heading__description">{description}</p> : null}
    </header>
  );
}

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & ClassNameProps & {
  variant?: SurfaceVariant;
};

export function Surface({ className, variant = "plain", children, ...props }: SurfaceProps) {
  return (
    <div className={joinClasses("atelix-surface", `atelix-surface--${variant}`, className)} {...props}>
      {children}
    </div>
  );
}

type ActionButtonBaseProps = ClassNameProps & {
  children: ReactNode;
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  disabled?: boolean;
};

type ActionButtonElementProps = ActionButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ActionButtonBaseProps> & {
    href?: never;
  };

type ActionButtonLinkProps = ActionButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ActionButtonBaseProps> & {
    href: string;
  };

export type ActionButtonProps = ActionButtonElementProps | ActionButtonLinkProps;

export function ActionButton({
  className,
  children,
  variant = "primary",
  size = "regular",
  disabled = false,
  ...props
}: ActionButtonProps) {
  const classes = joinClasses(
    "atelix-action-button",
    `atelix-action-button--${variant}`,
    `atelix-action-button--${size}`,
    disabled && "atelix-action-button--disabled",
    className,
  );

  if ("href" in props && props.href) {
    const { href, ...anchorProps } = props;
    return (
      <a
        {...anchorProps}
        className={classes}
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : anchorProps.tabIndex}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      {...(props as Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ActionButtonBaseProps>)}
      className={classes}
      type={(props as ButtonHTMLAttributes<HTMLButtonElement>).type ?? "button"}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export type IconLabelProps = HTMLAttributes<HTMLSpanElement> & ClassNameProps & {
  icon: ReactNode;
  children: ReactNode;
};

export function IconLabel({ className, icon, children, ...props }: IconLabelProps) {
  return (
    <span className={joinClasses("atelix-icon-label", className)} {...props}>
      <span className="atelix-icon-label__icon" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

type AnimatedRevealDomProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onAnimationEnd" | "onAnimationIteration" | "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragEnter" | "onDragExit" | "onDragLeave" | "onDragOver" | "onDragStart"
>;

export type AnimatedRevealProps = AnimatedRevealDomProps & ClassNameProps & {
  order?: number;
  once?: boolean;
  amount?: "small" | "medium" | "large";
  variant?: "lift" | "none";
};

export function AnimatedReveal({
  className,
  children,
  order = 0,
  once = true,
  amount = "medium",
  variant = "lift",
  ...props
}: AnimatedRevealProps) {
  const reduced = useReducedMotion();
  const lift = variant === "lift" ? 10 : 0;
  const viewportAmount = { small: 0.15, medium: 0.35, large: 0.65 }[amount];

  return (
    <motion.div
      {...props}
      className={joinClasses("atelix-animated-reveal", className)}
      initial={reduced ? false : { opacity: 1, y: lift }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once, amount: viewportAmount }}
      transition={reduced ? { duration: 0 } : {
        duration: 0.32,
        delay: Math.max(0, order) * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export type VisuallyHiddenProps = HTMLAttributes<HTMLSpanElement> & ClassNameProps;

export function VisuallyHidden({ className, children, ...props }: VisuallyHiddenProps) {
  return (
    <span className={joinClasses("atelix-visually-hidden", className)} {...props}>
      {children}
    </span>
  );
}

function getSkipTargetId(href: string | null) {
  return href?.startsWith("#") ? href.slice(1) : null;
}

export function focusSkipTarget(event: MouseEvent<HTMLAnchorElement>) {
  const targetId = getSkipTargetId(event.currentTarget.getAttribute("href"));
  if (!targetId) return;

  const target = document.getElementById(targetId);
  if (!target) return;

  event.preventDefault();
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

export type SkipLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
  children?: ReactNode;
  href?: string;
};

export function SkipLink({ className, children = "Skip to main content", href = "#main-content", onClick, ...props }: SkipLinkProps) {
  return (
    <a
      {...props}
      className={joinClasses("atelix-skip-link", className)}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) focusSkipTarget(event);
      }}
    >
      {children}
    </a>
  );
}

export type DemoUnavailableButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled"> & {
  children: ReactNode;
  reason?: ReactNode;
  label?: string;
};

export function DemoUnavailableButton({
  children,
  reason = "Unavailable in this demo preview.",
  label,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  ...props
}: DemoUnavailableButtonProps) {
  const reasonId = `atelix-demo-reason-${useId().replace(/:/g, "")}`;
  const descriptionIds = [describedBy, reasonId].filter(Boolean).join(" ");

  return (
    <>
      <button
        {...props}
        className={joinClasses("atelix-demo-unavailable", className)}
        type={props.type ?? "button"}
        disabled
        aria-disabled="true"
        aria-label={label ?? ariaLabel}
        aria-describedby={descriptionIds}
        data-demo-unavailable="true"
      >
        {children}
      </button>
      <VisuallyHidden id={reasonId}>{reason}</VisuallyHidden>
    </>
  );
}

export const skipTargetProps = { tabIndex: -1 } as const;
