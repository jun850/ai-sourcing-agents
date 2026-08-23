/**
 * Editorial and illustrative data for the public Atelix landing experience.
 *
 * Keep this module declarative. Components own markup, layout, motion, and
 * behavior; this file owns the copy and the mock records they render.
 */

export type LandingIconKind =
  | "activity"
  | "arrow-right"
  | "chart"
  | "check"
  | "chevron-down"
  | "external-link"
  | "mail"
  | "map-pin"
  | "paperclip"
  | "send"
  | "quality"
  | "sparkles";

export type FeatureIconKind = Extract<
  LandingIconKind,
  "activity" | "chart" | "quality"
>;

export type FeatureVisualKind = "tracking" | "network" | "quality";

export type JourneyPreviewKind =
  | "brief"
  | "draft"
  | "quotes"
  | "negotiation"
  | "production";

export type SupplierStatusKind = "certified" | "in-review";

export type EditorialHeading = {
  title: string;
  emphasis?: string;
  description?: string;
};

export type NavigationLink = {
  id: string;
  label: string;
  href: string;
};

export type BrandRecord = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
};

export type HeroContent = {
  eyebrow: string;
  title: string;
  emphasis: string;
  heading: EditorialHeading;
  description: string;
  image: {
    src: string;
    alt: string;
  };
  cta: string;
  ctaHref: string;
  imageSrc: string;
  imageAlt: string;
};

export type BriefPreviewContent = {
  prompt: string;
  inputLabel: string;
};

export type DraftPreviewContent = {
  title: string;
  companies: readonly {
    id: string;
    name: string;
    category: string;
    meta: string;
    tone: "blue" | "green" | "slate";
  }[];
};

export type QuotePreviewContent = {
  productLabel: string;
  status: string;
  rows: readonly {
    id: string;
    supplier: string;
    badge: string;
    unitCost: string;
    moq: string;
    tone: "blue" | "green" | "slate";
  }[];
};

export type NegotiationPreviewContent = {
  title: string;
  status: string;
  rows: readonly {
    id: string;
    label: string;
    previous: string;
    proposed: string;
  }[];
};

export type ProductionPreviewContent = {
  orderLabel: string;
  progressLabel: string;
  update: string;
  latestLabel: string;
  progressAriaLabel: string;
  progressSteps: number;
};

export type JourneyStepContent = {
  id: string;
  label: string;
  title: string;
  description: string;
  preview: JourneyPreviewKind;
};

export type JourneyContent = {
  sectionId: string;
  headingId: string;
  title: string;
  emphasis: string;
  description: string;
  heading: EditorialHeading;
  steps: readonly JourneyStepContent[];
  previews: {
    brief: BriefPreviewContent;
    draft: DraftPreviewContent;
    quotes: QuotePreviewContent;
    negotiation: NegotiationPreviewContent;
    production: ProductionPreviewContent;
  };
};

export type SupplierContent = {
  id: string;
  name: string;
  score: string;
  category: string;
  location: string;
  orders: string;
  price: string;
};

export type TrackingArtworkContent = {
  visual: "tracking";
  ariaLabel: string;
  metric: {
    primary: string;
    secondary: string;
  };
  performanceLabel: string;
  barCount: number;
};

export type NetworkArtworkContent = {
  visual: "network";
  ariaLabel: string;
  barHeights: readonly number[];
  trendPoints: readonly {
    x: number;
    y: number;
  }[];
};

export type QualityArtworkContent = {
  visual: "quality";
  ariaLabel: string;
  verificationMessage: string;
  statusLabel: string;
  statuses: readonly {
    id: string;
    label: string;
    kind: SupplierStatusKind;
  }[];
  reportButtonLabel: string;
  reportButtonAriaLabel: string;
  demoTag: string;
};

export type FeatureCardContent =
  | {
      id: string;
      title: string;
      description: string;
      icon: Extract<FeatureIconKind, "activity">;
      visual: "tracking";
      artworkLabel: string;
      artwork: TrackingArtworkContent;
    }
  | {
      id: string;
      title: string;
      description: string;
      icon: Extract<FeatureIconKind, "chart">;
      visual: "network";
      artworkLabel: string;
      artwork: NetworkArtworkContent;
    }
  | {
      id: string;
      title: string;
      description: string;
      icon: Extract<FeatureIconKind, "quality">;
      visual: "quality";
      artworkLabel: string;
      artwork: QualityArtworkContent;
    };

export type SupplierMatchingChatContent = {
  ariaLabel: string;
  assistantName: string;
  demoLabel: string;
  onlineStatusAriaLabel: string;
  prompt: string;
  resultsTitle: string;
  quoteButtonLabel: string;
  quoteButtonAriaLabelTemplate: string;
  demoTag: string;
  composerLabel: string;
  composerPlaceholder: string;
  sendButtonAriaLabel: string;
  name: string;
  status: string;
  quoteLabel: string;
  quoteUnavailable: string;
  sendLabel: string;
};

export type SupplierMatchingContent = {
  label: string;
  title: string;
  description: string;
  chat: SupplierMatchingChatContent;
  suppliers: readonly SupplierContent[];
};

export type SourcingContent = {
  sectionId: string;
  headingId: string;
  kicker: string;
  eyebrow: string;
  title: string;
  emphasis: string;
  description: string;
  label: string;
  matchingTitle: string;
  matchingDescription: string;
  heading: EditorialHeading;
  matching: SupplierMatchingContent;
  chat: SupplierMatchingChatContent;
  suppliers: readonly SupplierContent[];
  features: readonly FeatureCardContent[];
};

export type FaqContent = {
  id: string;
  question: string;
  answer: string;
};

export type FooterLinkGroup = {
  id: string;
  ariaLabel: string;
  heading: string;
  links: readonly NavigationLink[];
};

export type FooterContent = {
  heading: string;
  wordmark: string;
  wordmarkPunctuation: string;
  wordmarkHref: string;
  description: string;
  region: string;
  linkGroups: readonly FooterLinkGroup[];
  newsletter: {
    heading: string;
    description: string;
    emailLabel: string;
    emailPlaceholder: string;
    subscribeLabel: string;
    footnote: string;
    contactEmail: string;
    mailtoSubject: string;
    mailtoBodyTemplate: string;
  };
  copyright: string;
  contactEmail: string;
  contact: string;
  newsletterSubject: string;
  newsletterBody: string;
  intro: string;
  sourcingLabel: string;
  sourcingLinks: readonly NavigationLink[];
  companyLabel: string;
  companyLinks: readonly NavigationLink[];
  newsletterTitle: string;
  newsletterDescription: string;
  newsletterLabel: string;
  newsletterPlaceholder: string;
  subscribe: string;
  newsletterNote: string;
};

export type HeaderNavigationContent = {
  primary: readonly NavigationLink[];
  join: string;
  login: string;
  openMenuLabel: string;
  closeMenuLabel: string;
  closeMenuAriaLabel: string;
};

export type SupplierIntakeContent = {
  title: string;
  description: string;
  closeButtonLabel: string;
  success: {
    title: string;
    description: string;
    closeButtonLabel: string;
  };
  errorSummary: string;
  serviceErrorFallback: string;
  sections: {
    company: string;
    communication: string;
    manufacturing: string;
    operations: string;
  };
  fields: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    phoneCountryCodeLabel: string;
    address: string;
    yearsInBusiness: string;
    website: string;
    websiteHint: string;
    language: string;
    companyOverview: string;
    companyOverviewHint: string;
    categories: string;
    categoriesHint: string;
    leadTime: string;
    moq: string;
    moqPlaceholder: string;
    monthlyCapacity: string;
    monthlyCapacityPlaceholder: string;
    externalQualityControl: string;
    exportsAbroad: string;
    exportRegions: string;
    certifications: string;
    certificationsHint: string;
    thirdPartyQualityControl: string;
    rawMaterials: string;
    catalog: string;
    paymentTerms: string;
    paymentTermsPlaceholder: string;
    notes: string;
    notesHint: string;
  };
  choices: {
    languages: readonly string[];
    categories: readonly string[];
    countries: readonly {
      code: string;
      name: string;
    }[];
    regions: readonly string[];
    yesNoMaybe: readonly string[];
    yesNo: readonly string[];
    rawMaterials: readonly string[];
    catalog: readonly string[];
  };
  options: {
    selectAllThatApply: string;
    optional: string;
    yes: string;
    no: string;
  };
  submit: {
    idle: string;
    busy: string;
  };
  validation: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    yearsInBusiness: string;
    language: string;
    companyOverview: string;
    leadTime: string;
    moq: string;
    monthlyCapacity: string;
    choice: string;
    categories: string;
    exportRegions: string;
    paymentTerms: string;
    invalidEmail: string;
    invalidPhone: string;
  };
};

export type AtelixLandingContent = {
  brandName: string;
  skipLinkLabel: string;
  navigation: HeaderNavigationContent;
  header: {
    wordmark: string;
    wordmarkPunctuation: string;
    wordmarkHref: string;
    navigationAriaLabel: string;
    links: readonly NavigationLink[];
    joinLabel: string;
    signInHref: string;
    desktopSignInLabel: string;
    mobileSignInLabel: string;
    closeNavigationLabel: string;
    closeMenuAriaLabel: string;
    openNavigationLabel: string;
  };
  hero: HeroContent;
  brandRail: {
    sectionAriaLabel: string;
    label: string;
    brands: readonly BrandRecord[];
  };
  journey: JourneyContent;
  sourcing: SourcingContent;
  faq: {
    headingId: string;
    title: string;
    emphasis: string;
    heading: EditorialHeading;
    items: readonly FaqContent[];
  };
  footer: FooterContent;
  supplierIntake: SupplierIntakeContent;
};

export const atelixContent = {
  brandName: "Atelix",
  skipLinkLabel: "Skip to main content",
  navigation: {
    primary: [
      { id: "faq", label: "FAQ", href: "/#faq" },
    ],
    join: "Join Us",
    login: "Log in",
    openMenuLabel: "Open navigation",
    closeMenuLabel: "Close navigation",
    closeMenuAriaLabel: "Close navigation",
  },
  header: {
    wordmark: "atelix",
    wordmarkPunctuation: ".",
    wordmarkHref: "/",
    navigationAriaLabel: "Primary navigation",
    links: [
      { id: "faq", label: "FAQ", href: "/#faq" },
    ],
    joinLabel: "Join Us",
    signInHref: "/sign-in",
    desktopSignInLabel: "Log in",
    mobileSignInLabel: "Login",
    closeNavigationLabel: "Close navigation",
    closeMenuAriaLabel: "Close navigation",
    openNavigationLabel: "Open navigation",
  },
  hero: {
    eyebrow: "",
    title: "Your brief,",
    emphasis: "made ready for production.",
    heading: {
      title: "Your brief,",
      emphasis: "made ready for production.",
    },
    description:
      "Atelix is your sourcing broker. Tell us what you need in plain language or upload your tech pack — we turn it into a clear RFQ and take it to the right relationships.",
    image: {
      src: "/assets/generated/sourcing-agent.svg",
      alt: "A sourcing agent coordinating a global production brief",
    },
    cta: "Start sourcing",
    ctaHref: "/sign-in",
    imageSrc: "/assets/generated/sourcing-agent.svg",
    imageAlt: "A sourcing agent coordinating a global production brief",
  },
  brandRail: {
    sectionAriaLabel: "Retail destinations",
    label: "Trusted by brands sold at",
    brands: [
      { id: "1ldk", name: "1LDK", src: "/assets/brand-logos/1ldk.svg", width: 106, height: 26 },
      { id: "amazon", name: "Amazon", src: "/assets/brand-logos/amazon.svg", width: 96, height: 32 },
      { id: "shopee", name: "Shopee", src: "/assets/brand-logos/shopee.svg", width: 94, height: 30 },
      { id: "united-arrows", name: "United Arrows", src: "/assets/brand-logos/united-arrows.png", width: 132, height: 16 },
      { id: "incu", name: "Incu", src: "/assets/brand-logos/incu.svg", width: 58, height: 26 },
      { id: "club21", name: "Club21", src: "/assets/brand-logos/club21.png", width: 42, height: 42 },
    ],
  },
  journey: {
    sectionId: "how",
    headingId: "how-title",
    title: "How it",
    emphasis: "works",
    description: "A focused path from whatever you have today to an RFQ you can approve with confidence.",
    heading: {
      title: "How it",
      emphasis: "works",
      description: "A focused path from whatever you have today to an RFQ you can approve with confidence.",
    },
    steps: [
      {
        id: "start-here",
        label: "1 MINUTE",
        title: "Submit Your RFQ",
        description:
          "Send us your RFQ in whatever format you have — a spec sheet, photos, or a few sentences. Our AI agent captures the essentials so our sourcing team can start with the right context.",
        preview: "brief",
      },
      {
        id: "we-prepare",
        label: "1–2 DAYS",
        title: "Your RFQ Draft Takes Shape",
        description:
          "Our AI organizes the brief, flags missing details, and asks the right follow-up questions. Our team reviews the draft with you before it is shared with qualified suppliers.",
        preview: "draft",
      },
      {
        id: "quotes-and-samples",
        label: "1–2 WEEKS",
        title: "Quotes & Samples in Your Hands",
        description:
          "We send the approved RFQ to qualified suppliers, normalize side-by-side quotes, and coordinate the samples you choose. Compare price, MOQ, capability, and sample status in one place.",
        preview: "quotes",
      },
      {
        id: "when-you-are-ready",
        label: "1–5 DAYS",
        title: "We Negotiate When You Say Go",
        description:
          "Once you choose a supplier, our AI agents negotiate payment terms, MOQ, and unit price with human-in-the-loop review before anything is sent on your behalf—keeping the pricing conversation moving efficiently while you sleep. Nothing is committed without your approval.",
        preview: "negotiation",
      },
      {
        id: "in-production",
        label: "4–12 WEEKS",
        title: "Production, QC & Delivery",
        description:
          "Once production starts, we share milestone updates and photo documentation. We flag delays or material issues early, coordinate pre-shipment QC, and track customs and last-mile delivery.",
        preview: "production",
      },
    ],
    previews: {
      brief: {
        prompt: "I need 1,000 cotton polo shirts with 3-color screen printing. Looking for 180 GSM cotton/poly blend.",
        inputLabel: "Upload tech pack or describe your product",
      },
      draft: {
        title: "Our Team Puts AI to Work",
        companies: [
          { id: "garment-java", name: "PT Garment Jaya", category: "Soft goods, finishing", meta: "23 orders completed", tone: "blue" },
          { id: "bali-textile", name: "Bali Textile Collective", category: "Sustainable materials", meta: "15 orders completed", tone: "green" },
          { id: "jakarta-fashion", name: "Jakarta Fashion Mfg", category: "Technical performance goods", meta: "31 orders completed", tone: "slate" },
        ],
      },
      quotes: {
        productLabel: "Cotton Polo Shirts",
        status: "Quotes",
        rows: [
          { id: "garment-java", supplier: "PT Garment Jaya", badge: "Top", unitCost: "$4.20", moq: "5,000", tone: "blue" },
          { id: "bali-textile", supplier: "Bali Textile Collective", badge: "92%", unitCost: "$4.85", moq: "3,000", tone: "green" },
          { id: "jakarta-fashion", supplier: "Jakarta Fashion Mfg", badge: "88%", unitCost: "$5.10", moq: "2,000", tone: "slate" },
        ],
      },
      negotiation: {
        title: "Negotiation support",
        status: "Illustrative",
        rows: [
          { id: "payment-terms", label: "Payment terms", previous: "100% upfront", proposed: "30 / 70" },
          { id: "moq", label: "MOQ", previous: "5,000 units", proposed: "2,500 units" },
          { id: "unit-price", label: "Unit price", previous: "$4.85", proposed: "$4.40" },
        ],
      },
      production: {
        orderLabel: "Order #PO-1847",
        progressLabel: "Week 3 of 8",
        update: "Production update received",
        latestLabel: "Latest",
        progressAriaLabel: "Production progress",
        progressSteps: 4,
      },
    },
  },
  sourcing: {
    sectionId: "sourcing-intelligence",
    headingId: "atelix-title",
    kicker: "Sourcing intelligence, on the ground",
    eyebrow: "Sourcing intelligence, on the ground",
    title: "Your sourcing team,",
    emphasis: "on the ground.",
    description:
      "We’re your eyes, ears, and problem-solvers on the factory floor—so you don’t have to fly 10,000 miles when issues arise.",
    label: "01 · Match with confidence",
    matchingTitle: "Smart Factory Matching",
    matchingDescription:
      "Our agents scan factories in and beyond our 50-year network—verifying certifications, pulling real export and delivery history, and scoring on-time rates and defect history. Every shortlist is reviewed before it reaches you.",
    heading: {
      title: "Your sourcing team,",
      emphasis: "on the ground.",
      description:
        "We’re your eyes, ears, and problem-solvers on the factory floor—so you don’t have to fly 10,000 miles when issues arise.",
    },
    matching: {
      label: "01 · Match with confidence",
      title: "Smart Factory Matching",
      description:
        "Our agents scan factories in and beyond our 50-year network—verifying certifications, pulling real export and delivery history, and scoring on-time rates and defect history. Every shortlist is reviewed before it reaches you.",
      chat: {
        ariaLabel: "Atelix AI supplier matching demo",
        assistantName: "Atelix AI",
        demoLabel: "Illustrative demo",
        onlineStatusAriaLabel: "Online",
        prompt: "1,000 cotton polo shirts, 180 GSM, screen printing",
        resultsTitle: "Found 3 matching suppliers:",
        quoteButtonLabel: "Get Quote",
        quoteButtonAriaLabelTemplate: "Get Quote for {supplierName} (demo only; unavailable in preview)",
        demoTag: "(demo)",
        composerLabel: "Ask about manufacturers",
        composerPlaceholder: "Ask about manufacturers…",
        sendButtonAriaLabel: "Send message (demo only; unavailable in preview)",
        name: "Atelix AI",
        status: "Illustrative demo",
        quoteLabel: "Get Quote",
        quoteUnavailable: "demo only; unavailable in preview",
        sendLabel: "Send message (demo only; unavailable in preview)",
      },
      suppliers: [
        {
          id: "pt-garment-java",
          name: "PT Garment Java",
          score: "87% on-time",
          category: "Soft goods, finishing",
          location: "Surabaya",
          orders: "23 orders completed",
          price: "$6.80–7.20/unit",
        },
        {
          id: "bali-textile-co",
          name: "Bali Textile Co.",
          score: "93% on-time",
          category: "Sustainable materials",
          location: "Ubud, Bali",
          orders: "15 orders completed",
          price: "$7.20–8.00/unit",
        },
        {
          id: "jakarta-fashion-mfg",
          name: "Jakarta Fashion Mfg",
          score: "84% on-time",
          category: "Technical goods",
          location: "Jakarta",
          orders: "31 orders completed",
          price: "$7.40–8.20/unit",
        },
      ],
    },
    chat: {
      ariaLabel: "Atelix AI supplier matching demo",
      assistantName: "Atelix AI",
      demoLabel: "Illustrative demo",
      onlineStatusAriaLabel: "Online",
      prompt: "1,000 cotton polo shirts, 180 GSM, screen printing",
      resultsTitle: "Found 3 matching suppliers:",
      quoteButtonLabel: "Get Quote",
      quoteButtonAriaLabelTemplate: "Get Quote for {supplierName} (demo only; unavailable in preview)",
      demoTag: "(demo)",
      composerLabel: "Ask about manufacturers",
      composerPlaceholder: "Ask about manufacturers…",
      sendButtonAriaLabel: "Send message (demo only; unavailable in preview)",
      name: "Atelix AI",
      status: "Illustrative demo",
      quoteLabel: "Get Quote",
      quoteUnavailable: "demo only; unavailable in preview",
      sendLabel: "Send message (demo only; unavailable in preview)",
    },
    suppliers: [
      {
        id: "pt-garment-java",
        name: "PT Garment Java",
        score: "87% on-time",
        category: "Soft goods, finishing",
        location: "Surabaya",
        orders: "23 orders completed",
        price: "$6.80–7.20/unit",
      },
      {
        id: "bali-textile-co",
        name: "Bali Textile Co.",
        score: "93% on-time",
        category: "Sustainable materials",
        location: "Ubud, Bali",
        orders: "15 orders completed",
        price: "$7.20–8.00/unit",
      },
      {
        id: "jakarta-fashion-mfg",
        name: "Jakarta Fashion Mfg",
        score: "84% on-time",
        category: "Technical goods",
        location: "Jakarta",
        orders: "31 orders completed",
        price: "$7.40–8.20/unit",
      },
    ],
    features: [
      {
        id: "real-time-production-tracking",
        title: "Real-Time Production Tracking",
        description:
          "We check in with factories 2x/week. Get photo updates at key milestones and proactive alerts if any issues arise—before they become problems.",
        icon: "activity",
        visual: "tracking",
        artworkLabel: "5 active suppliers performance overview",
        artwork: {
          visual: "tracking",
          ariaLabel: "5 active suppliers performance overview",
          metric: {
            primary: "5 Active",
            secondary: "Suppliers",
          },
          performanceLabel: "Performance Overview",
          barCount: 3,
        },
      },
      {
        id: "network-powered-intelligence",
        title: "Network-Powered Intelligence",
        description:
          "Every order improves our factory ratings and pricing data. You benefit from insights across all our clients—know if quotes are fair, which factories deliver, and what to watch for.",
        icon: "chart",
        visual: "network",
        artworkLabel: "Illustrative supplier performance trend",
        artwork: {
          visual: "network",
          ariaLabel: "Illustrative supplier performance trend",
          barHeights: [28, 46, 35, 64, 48, 76, 56],
          trendPoints: [
            { x: 18, y: 108 },
            { x: 82, y: 92 },
            { x: 146, y: 111 },
            { x: 210, y: 70 },
            { x: 274, y: 88 },
            { x: 338, y: 42 },
            { x: 402, y: 62 },
          ],
        },
      },
      {
        id: "quality-guarantee",
        title: "Quality Guarantee (3-Stage QC)",
        description:
          "We catch defects before they ship. Pre-production samples → in-process monitoring → pre-shipment inspection. Our 2.1% defect rate vs 5–8% industry average.",
        icon: "quality",
        visual: "quality",
        artworkLabel: "Quality verification status for an illustrative supplier",
        artwork: {
          visual: "quality",
          ariaLabel: "Quality verification status for an illustrative supplier",
          verificationMessage: "Quality verification in progress for PT…",
          statusLabel: "Verification Status",
          statuses: [
            { id: "certified", label: "Certified", kind: "certified" },
            { id: "in-review", label: "In Review", kind: "in-review" },
          ],
          reportButtonLabel: "View Report",
          reportButtonAriaLabel: "View Report (demo only; unavailable in preview)",
          demoTag: "(demo)",
        },
      },
    ],
  },
  faq: {
    headingId: "faq-title",
    title: "Frequently asked",
    emphasis: "questions",
    heading: {
      title: "Frequently asked",
      emphasis: "questions",
    },
    items: [
      {
        id: "what-is-atelix",
        question: "What is Atelix?",
        answer:
          "Atelix is a fashion-sourcing broker. You provide the brief; we help structure the RFQ and keep the working steps visible.",
      },
      {
        id: "ai-or-people",
        question: "Am I working with AI or people?",
        answer:
          "Both. AI helps structure a brief, while the sourcing work and progress updates remain guided by the Atelix team.",
      },
      {
        id: "factory-direct",
        question: "Why not just go factory direct?",
        answer:
          "A good fit depends on the brief, production capacity, quality requirements, and timing. We help make that evaluation clearer before you commit.",
      },
      {
        id: "what-can-i-source",
        question: "What can I source through Atelix?",
        answer:
          "The MVP is designed for fashion and apparel sourcing briefs, including garments, relevant materials, and reference-led product development.",
      },
    ],
  },
  footer: {
    heading: "Atelix footer",
    wordmark: "atelix",
    wordmarkPunctuation: ".",
    wordmarkHref: "/",
    description: "Sourcing intelligence for better supplier decisions.",
    region: "Across Asia-Pacific manufacturing",
    linkGroups: [
      {
        id: "sourcing",
        ariaLabel: "Sourcing",
        heading: "Sourcing",
        links: [
          { id: "sourcing-guide", label: "Sourcing Guide", href: "/sourcing-guide" },
          { id: "private-label", label: "Private Label", href: "/private-label" },
          { id: "quality-control", label: "Quality Control", href: "/quality-control" },
          { id: "alibaba-alternative", label: "Alibaba Alternative", href: "/alibaba-alternative" },
        ],
      },
      {
        id: "company",
        ariaLabel: "Company",
        heading: "Company",
        links: [
          { id: "about", label: "About", href: "/about" },
          { id: "supplier-guide", label: "Supplier Guide", href: "/supplier-guide" },
          { id: "privacy-policy", label: "Privacy Policy", href: "/privacy-policy" },
          { id: "terms-of-service", label: "Terms of Service", href: "/terms-of-service" },
        ],
      },
    ],
    newsletter: {
      heading: "Stay Updated",
      description: "Get sourcing tips & industry updates.",
      emailLabel: "Work email",
      emailPlaceholder: "Your work email",
      subscribeLabel: "Subscribe",
      footnote: "Work email only.",
      contactEmail: "info@arcanawangsa.com",
      mailtoSubject: "Atelix newsletter updates",
      mailtoBodyTemplate: "Please add {email} to the Atelix newsletter.",
    },
    copyright: "© Atelix, 2026. All rights reserved.",
    contactEmail: "info@arcanawangsa.com",
    contact: "info@arcanawangsa.com",
    newsletterSubject: "Atelix newsletter updates",
    newsletterBody: "Please add {email} to the Atelix newsletter.",
    intro: "Sourcing intelligence for better supplier decisions.",
    sourcingLabel: "Sourcing",
    sourcingLinks: [
      { id: "sourcing-guide", label: "Sourcing Guide", href: "/sourcing-guide" },
      { id: "private-label", label: "Private Label", href: "/private-label" },
      { id: "quality-control", label: "Quality Control", href: "/quality-control" },
      { id: "alibaba-alternative", label: "Alibaba Alternative", href: "/alibaba-alternative" },
    ],
    companyLabel: "Company",
    companyLinks: [
      { id: "about", label: "About", href: "/about" },
      { id: "supplier-guide", label: "Supplier Guide", href: "/supplier-guide" },
      { id: "privacy-policy", label: "Privacy Policy", href: "/privacy-policy" },
      { id: "terms-of-service", label: "Terms of Service", href: "/terms-of-service" },
    ],
    newsletterTitle: "Stay Updated",
    newsletterDescription: "Get sourcing tips & industry updates.",
    newsletterLabel: "Work email",
    newsletterPlaceholder: "Your work email",
    subscribe: "Subscribe",
    newsletterNote: "Work email only.",
  },
  supplierIntake: {
    title: "Join Atelix as Supplier",
    description:
      "A short form so we can understand your capabilities and explore a sourcing partnership. Qualified suppliers will be introduced to relevant global buyers in our network.",
    closeButtonLabel: "Close supplier intake dialog",
    success: {
      title: "Thanks — your details are recorded.",
      description:
        "We’ll review your capabilities and contact you separately if there’s a fit for an Atelix sourcing conversation.",
      closeButtonLabel: "Close",
    },
    errorSummary: "Review the highlighted fields before submitting.",
    serviceErrorFallback: "We could not record your intake. Please try again.",
    sections: {
      company: "Company & contact",
      communication: "Communication",
      manufacturing: "What you make",
      operations: "Operations",
    },
    fields: {
      companyName: "Company name",
      contactName: "Main contact name",
      email: "Contact email",
      phone: "Contact phone",
      phoneCountryCodeLabel: "Country calling code",
      address: "Address",
      yearsInBusiness: "Years in business",
      website: "Company website",
      websiteHint: "Optional",
      language: "Preferred language of communication",
      companyOverview: "Tell us about your company",
      companyOverviewHint: "Two or three sentences: what you make, who you serve, and what makes you different.",
      categories: "Manufacturing categories",
      categoriesHint: "Select all that apply",
      leadTime: "Typical lead time (days)",
      moq: "Minimum MOQ",
      moqPlaceholder: "e.g. 1,000 units",
      monthlyCapacity: "Max monthly order capacity",
      monthlyCapacityPlaceholder: "e.g. 50,000 units / 20 MT",
      externalQualityControl: "Open to external quality control?",
      exportsAbroad: "Have you ever exported your goods abroad?",
      exportRegions: "If yes, select the regions below",
      certifications: "Certifications",
      certificationsHint: "Optional — for example Sedex, WRAP, or OEKO-TEX",
      thirdPartyQualityControl: "Does the company accept third-party quality control?",
      rawMaterials: "Looking to source raw materials at lower price + premium quality?",
      catalog: "Do you have a product catalog?",
      paymentTerms: "Preferred payment terms",
      paymentTermsPlaceholder: "e.g. 30% deposit, 70% before shipment",
      notes: "Anything else we should know?",
      notesHint: "Optional",
    },
    choices: {
      languages: ["English", "Indonesian", "Mandarin", "Other"],
      categories: [
        "Textile / Garment / Apparel",
        "Furniture / Homegoods",
        "Essential Oil / Skincare / Fragrance",
        "Hardware / Utilities",
        "Other",
      ],
      countries: [
        { code: "+1", name: "United States / Canada" },
        { code: "+44", name: "United Kingdom" },
        { code: "+61", name: "Australia" },
        { code: "+62", name: "Indonesia" },
        { code: "+81", name: "Japan" },
        { code: "+86", name: "China" },
        { code: "+91", name: "India" },
        { code: "+64", name: "New Zealand" },
        { code: "+65", name: "Singapore" },
        { code: "+66", name: "Thailand" },
        { code: "+84", name: "Vietnam" },
        { code: "+971", name: "United Arab Emirates" },
      ],
      regions: ["North America", "Asia", "Australia", "New Zealand", "Europe"],
      yesNoMaybe: ["Yes", "No", "Maybe"],
      yesNo: ["Yes", "No"],
      rawMaterials: ["Interested", "Not really"],
      catalog: ["Yes", "No"],
    },
    options: {
      selectAllThatApply: "Select all that apply",
      optional: "Optional",
      yes: "Yes",
      no: "No",
    },
    submit: {
      idle: "Submit supplier intake",
      busy: "Recording intake…",
    },
    validation: {
      companyName: "Add your company name.",
      contactName: "Add a main contact name.",
      email: "Add a work email.",
      phone: "Add a contact phone number.",
      address: "Add your company address.",
      yearsInBusiness: "Add the years you have been in business.",
      language: "Choose a communication language.",
      companyOverview: "Tell us briefly about your company.",
      leadTime: "Add a typical lead time.",
      moq: "Add your minimum MOQ.",
      monthlyCapacity: "Add your monthly capacity.",
      choice: "Choose an option.",
      categories: "Choose at least one category.",
      exportRegions: "Choose at least one region.",
      paymentTerms: "Add your preferred payment terms.",
      invalidEmail: "Use a valid work email.",
      invalidPhone: "Use a valid contact number.",
    },
  },
} as const satisfies AtelixLandingContent;
