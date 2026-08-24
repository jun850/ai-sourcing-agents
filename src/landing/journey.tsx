import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowUp, Building2, FileCheck2, Globe, Plus, Send, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import { atelixContent, type JourneyContent, type JourneyPreviewKind } from "../content/atelix";
import { journeyMotion } from "./motion";

export type { JourneyContent, JourneyPreviewKind } from "../content/atelix";

type PreviewContent<K extends JourneyPreviewKind> = JourneyContent["previews"][K];
type PreviewProps<K extends JourneyPreviewKind> = { content: PreviewContent<K> };

function BriefPreview({ content }: PreviewProps<"brief">) {
  return (
    <div className="journey-preview journey-preview--brief">
      <p>
        <Sparkles className="journey-rfq-sparkle" size={14} aria-hidden="true" />
        <span>{content.prompt}</span>
      </p>
      <div className="journey-input-sim">
        <span>{content.inputLabel}</span>
        <span className="journey-input-actions" aria-hidden="true">
          <Plus size={25} strokeWidth={2.5} />
          <Globe size={25} strokeWidth={2.1} />
          <span className="journey-send-button"><ArrowUp size={21} strokeWidth={2.7} /></span>
        </span>
      </div>
    </div>
  );
}

function DraftPreview({ content }: PreviewProps<"draft">) {
  return (
    <div className="journey-preview journey-preview--qualification">
      <div className="journey-qualification-heading">
        <span className="journey-qualification-icon"><FileCheck2 size={18} aria-hidden="true" /></span>
        <span className="journey-qualification-title"><strong>{content.title}</strong></span>
        <em>3 matches</em>
      </div>
      <div className="journey-qualification-body">
        <div className="journey-qualification-list">
          {content.companies.map((company) => (
            <div className={`journey-company-row journey-company-row--${company.tone}`} key={company.id}>
              <span className="journey-company-icon"><Building2 size={21} aria-hidden="true" /></span>
              <span><strong>{company.name}</strong><small>{company.category}</small></span>
              <em>{company.meta}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuotesPreview({ content }: PreviewProps<"quotes">) {
  return (
    <div className="journey-preview journey-preview--quotes">
      <div className="journey-quotes-heading">
        <span className="journey-product-icon" aria-hidden="true">👖</span>
        <strong>{content.productLabel}</strong>
        <em>{content.status}</em>
      </div>
      <div className="journey-quotes-columns" aria-hidden="true"><span>Supplier</span><span>Unit Cost</span><span>MOQ</span></div>
      <div className="journey-quotes-rows">
        {content.rows.map((row) => (
          <div className="journey-quotes-row" key={row.id}>
            <span className={`journey-supplier-avatar journey-supplier-avatar--${row.tone}`} aria-hidden="true" />
            <strong>{row.supplier}</strong>
            <em className={`journey-quote-badge journey-quote-badge--${row.tone}`}>{row.badge}</em>
            <b>{row.unitCost}</b>
            <span>{row.moq}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NegotiationPreview({ content }: PreviewProps<"negotiation">) {
  return (
    <div className="journey-preview journey-preview--rows">
      <div className="journey-preview-heading">
        <strong>{content.title}</strong>
        <em>{content.status}</em>
      </div>
      {content.rows.map((row) => (
        <div className="journey-preview-row journey-preview-row--comparison" key={row.id}>
          <span>{row.label}</span>
          <s>{row.previous}</s>
          <strong>{row.proposed}</strong>
        </div>
      ))}
    </div>
  );
}

function ProductionPreview({ content }: PreviewProps<"production">) {
  return (
    <div className="journey-preview journey-preview--production">
      <div className="journey-preview-heading">
        <strong>{content.orderLabel}</strong>
        <em>{content.progressLabel}</em>
      </div>
      <p className="journey-production-update">
        <span className="journey-pulse" aria-hidden="true" />
        <span>{content.update}</span>
        <small>{content.latestLabel}</small>
      </p>
      <ol className="journey-production-steps" aria-label={content.progressAriaLabel}>
        {Array.from({ length: content.progressSteps }, (_, index) => (
          <li className={index === 0 ? "is-complete" : undefined} key={index}>
            <span aria-hidden="true" />
            <span>{index + 1}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type PreviewRegistry = {
  [K in JourneyPreviewKind]: ComponentType<PreviewProps<K>>;
};

export const journeyPreviewRegistry = {
  brief: BriefPreview,
  draft: DraftPreview,
  quotes: QuotesPreview,
  negotiation: NegotiationPreview,
  production: ProductionPreview,
} satisfies PreviewRegistry;

function JourneyPreview({ kind, previews }: { kind: JourneyPreviewKind; previews: JourneyContent["previews"] }) {
  switch (kind) {
    case "brief": {
      const Preview = journeyPreviewRegistry.brief;
      return <Preview content={previews.brief} />;
    }
    case "draft": {
      const Preview = journeyPreviewRegistry.draft;
      return <Preview content={previews.draft} />;
    }
    case "quotes": {
      const Preview = journeyPreviewRegistry.quotes;
      return <Preview content={previews.quotes} />;
    }
    case "negotiation": {
      const Preview = journeyPreviewRegistry.negotiation;
      return <Preview content={previews.negotiation} />;
    }
    case "production": {
      const Preview = journeyPreviewRegistry.production;
      return <Preview content={previews.production} />;
    }
  }
}

type JourneyCardProps = {
  step: JourneyContent["steps"][number];
  index: number;
  totalSteps: number;
  previews: JourneyContent["previews"];
  reduced: boolean;
  journeyProgress: MotionValue<number>;
};

function JourneyCard({ step, index, totalSteps, previews, reduced, journeyProgress }: JourneyCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: [journeyMotion.card.offset[0], journeyMotion.card.offset[1]],
  });
  const cardOpacity = useTransform(
    scrollYProgress,
    [...journeyMotion.card.opacityInput],
    [...journeyMotion.card.opacityOutput],
  );
  const checkpointCenter = (index + 0.5) / totalSteps;
  const checkpointProgress = useTransform(
    journeyProgress,
    [
      Math.max(0, checkpointCenter - journeyMotion.checkpoint.centerOffset),
      Math.min(1, checkpointCenter + journeyMotion.checkpoint.centerOffset),
    ],
    [0, 1],
  );
  const checkpointBorder = useTransform(checkpointProgress, [...journeyMotion.checkpoint.borderInput], [...journeyMotion.checkpoint.borderOutput]);
  const checkpointFill = useTransform(checkpointProgress, [...journeyMotion.checkpoint.borderInput], [...journeyMotion.checkpoint.fillOutput]);
  const checkpointScale = useTransform(checkpointProgress, [...journeyMotion.checkpoint.borderInput], [...journeyMotion.checkpoint.scaleOutput]);
  const dotStyle = {
    borderColor: reduced ? "#7fb879" : checkpointBorder,
  };
  const dotFillStyle = {
    backgroundColor: reduced ? "#7fb879" : checkpointFill,
    scale: reduced ? 1 : checkpointScale,
  };
  const side = index % 2 === 1 ? "right" : "left";

  return (
    <>
      <motion.article
        ref={cardRef}
        className={`journey-card journey-card--${side}`}
        style={{ gridRow: index + 1, opacity: reduced ? 1 : cardOpacity }}
      >
        <motion.span className="journey-dot journey-dot-mobile journey-dot--mobile" aria-hidden="true" style={dotStyle}>
          <motion.i style={dotFillStyle} />
        </motion.span>
        <small className="journey-step-label">{step.label}</small>
        <h3>{step.title}</h3>
        <p className="journey-card-description">{step.description}</p>
        <JourneyPreview kind={step.preview} previews={previews} />
      </motion.article>
      <motion.span
        className="journey-dot journey-dot-desktop journey-dot--desktop"
        aria-hidden="true"
        style={{ ...dotStyle, gridColumn: 2, gridRow: index + 1 }}
      >
        <motion.i style={dotFillStyle} />
      </motion.span>
    </>
  );
}

export type JourneyProps = {
  content?: JourneyContent;
  id?: string;
};

export function Journey({ content = atelixContent.journey, id }: JourneyProps) {
  const reducedMotion = useReducedMotion();
  const reduced = reducedMotion ?? false;
  const stageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: [journeyMotion.stage.offset[0], journeyMotion.stage.offset[1]],
  });
  const journeyProgress = useSpring(scrollYProgress, journeyMotion.railSpring);
  const sectionId = id ?? content.sectionId;
  const headingId = content.headingId;

  return (
    <section id={sectionId} className="journey" aria-labelledby={headingId}>
      <header className="journey-head">
        <h2 id={headingId}>
          {content.heading.title} <em>{content.heading.emphasis}</em>
        </h2>
        <p>{content.heading.description}</p>
      </header>
      <div ref={stageRef} className="journey-stage">
        <div className="journey-rail" aria-hidden="true">
          <motion.i style={{ scaleY: reduced ? 1 : journeyProgress }} />
        </div>
        {content.steps.map((step, index) => (
          <JourneyCard
            key={step.id}
            step={step}
            index={index}
            totalSteps={content.steps.length}
            previews={content.previews}
            reduced={reduced}
            journeyProgress={journeyProgress}
          />
        ))}
      </div>
    </section>
  );
}

export default Journey;
