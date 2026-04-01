# UI_DESIGN.md

Visual identity for this application. Source of truth for colors, typography,
spacing, and component patterns.

## 1) Design North Star

- clean and modern
- mobile-first
- content over chrome
- every element earns its place
- {BRAND_ADJECTIVE_1}, {BRAND_ADJECTIVE_2} (set by init-project)

## 2) Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| primary | {PRIMARY_COLOR:#3B82F6} | interactive elements only |
| surface | {SURFACE_COLOR:#FAFAFA} | page background |
| surface-alt | {SURFACE_ALT:#F1F5F9} | section alternation |
| text | #1A1B1E | body text |
| text-secondary | #64748B | metadata, captions |
| destructive | #EF4444 | error states |

Primary color is for interactive elements only — never backgrounds, never body
text.

## 3) Typography

| Tier | Font | Use |
|------|------|-----|
| UI | Inter | nav, buttons, metadata, all chrome |

V1 uses Inter for all tiers. Init-project may add display/body fonts.

Minimum 14px for body text on mobile.

## 4) Spacing

8px base grid. Major section gaps: 48-64px. Component internal padding: 16-24px.
Mobile margins: 16px. Desktop margins: 24-32px.

## 5) Components

shadcn-style primitives only (cva + Radix Slot). Do not add a second component
library. See `apps/web/src/components/ui/` for available primitives.

## 6) Responsive

Mobile-first utility classes. Breakpoints: sm (640px), md (768px), lg (1024px).
Max layout width: 1200px.
