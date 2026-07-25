# UI_DESIGN.md

Visual identity for this application. Source of truth for colors, typography,
spacing, and component patterns.

## 1) Design North Star

- clean and modern
- mobile-first
- content over chrome
- every element earns its place
- slick yet quirky, geeky — the spirit of the Samurai embodied
- calm and focused: the UI reduces inbox anxiety, never adds to it

The design language is **"Sumi & Washi"**: editorial Japanese minimalism.
Warm paper surfaces, sumi-ink text, aizome indigo for interaction, one
vermilion hanko (seal) mark as the brand quirk, and generous *ma*
(negative space). Explicitly avoided: dark-mode+neon SaaS clichés and
cargo-cult Japanese kitsch (cherry blossoms, torii gates, brush fonts).

## 2) Color Palette

Tokens live in `apps/web/src/styles/globals.css` (`@theme`).

| Token | Value | Usage |
|-------|-------|-------|
| surface | #FAF8F3 | page background — kinari warm paper |
| surface-alt | #F2EDE3 | section alternation — oat |
| card | #FFFDF9 | card surfaces |
| ink | #1C1E26 | body text + headings — sumi ink |
| ink-muted | #5C5F68 | secondary text, metadata (≥4.5:1 on surface-alt) |
| ink-section | #16181F | the single dark accent band per page |
| primary | #3E4784 | interactive elements only — aizome (Japanese indigo) |
| primary-hover | #333A6E | primary hover state |
| seal | #C73E2E | hanko brand mark + at most one accent per screen |
| destructive | #B42318 | error states only |
| border | #E5DFD2 | hairlines: cards, nav, dividers |
| border-strong | #9C9280 | form input borders (≥3:1 against card) |

Rules:
- Primary is for interactive elements only — never backgrounds, never body text.
- **Seal vs destructive:** seal (vermilion) is decorative brand identity — the
  hanko mark, never CTAs, never text that carries meaning. Destructive is for
  error states in forms/actions. They are adjacent reds by design; they must
  never appear in the same context.
- At most one `ink-section` dark band per page (CTA/footer). Dark is the
  accent, not the default.

## 3) Typography

| Tier | Font | Use |
|------|------|-----|
| Display | Fraunces (variable, opsz) | headlines only, weight 550–650, tight tracking |
| UI/Body | Inter | nav, buttons, forms, body text, all chrome |
| Label | IBM Plex Mono | tiny uppercase kickers, tracking-[0.25em], weight 500 |
| Kanji | font-kanji (system CJK serif stack) | decorative kanji only — Fraunces has no CJK glyphs |

- The kanji brand mark (柳 in a vermilion rounded square) is an inline SVG:
  `apps/web/src/components/hanko-mark.tsx`. Do not recreate it with webfonts.
- Decorative kanji (watermarks, principle glyphs) are always `aria-hidden`
  with adjacent English labels, and hidden on mobile when large.
- Quirk budget: at most one quirky element per section (watermark, kanji,
  mono kicker). Restraint is the brand.
- Minimum 14px for body text on mobile.

## 4) Spacing

8px base grid. Major section gaps: 48-64px. Component internal padding: 16-24px.
Mobile margins: 16px. Desktop margins: 24-32px. Hero and section layouts are
left-aligned/asymmetric with deliberate negative space (*ma*) — avoid
center-everything layouts.

## 5) Components

shadcn-style primitives only (cva + Radix Slot). Do not add a second component
library. See `apps/web/src/components/ui/` for available primitives.

Interaction states: primary buttons lift 1px with a soft shadow on hover;
focus-visible rings use `primary/40`; disabled is 50% opacity.

## 6) Responsive

Mobile-first utility classes. Breakpoints: sm (640px), md (768px), lg (1024px).
Max layout width: 1200px (content columns typically `max-w-5xl`).
