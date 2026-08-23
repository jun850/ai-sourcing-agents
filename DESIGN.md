# Atelix design system

## Green Room

Atelix uses the existing Green Room vocabulary from the consolidated Vite application: quiet slate neutrals, white working surfaces, and moss green as a restrained signal for progress, selection, and primary action. The product should feel playful and modern without becoming decorative or wordy.

## Rules

- Preserve the existing landing page, dashboard shell, motion language, rounded controls, and responsive drawer.
- Design for the broker-led path from prompt or reference, through RFQ, human review, vetted matching, invoice/payment, quality, and logistics handoffs. Keep supplier and commercial facts inside reviewed, permissioned records.
- Use the established neutral sans stack throughout product UI.
- Keep one clear primary action per view; color communicates state rather than decoration.
- Use existing components and tokens before adding variants. Do not add promotional strips or new content sections unless requested.
- Working tables become structured list rows on narrow screens; do not force horizontal task scrolling.
- Provide default, hover, focus-visible, active, disabled, loading, empty, error, success, and permission-denied states where applicable.
- Motion communicates state in roughly 150–250 ms and has a reduced-motion alternative.
- Body copy stays within a readable measure. Controls remain at least 24 by 24 CSS pixels, with larger touch targets where practical.
- Avoid nested cards, decorative gradients, glass effects, oversized rounding, and dashboard metric-card filler.
- Preserve current routes and their guarded boundaries; do not reintroduce public shopping or unreviewed supplier-discovery surfaces.

## Accessibility target

WCAG 2.2 AA: semantic landmarks and headings, native controls, programmatic labels and errors, logical focus order, visible focus, sufficient contrast, accessible authentication, keyboard-complete dialogs and drawers, route titles, resize/reflow support, and no motion-dependent understanding.
