# DESIGN.md — Book Illustrator visual system

> Structural inspiration from Anthropic's product design (warm neutral canvas,
> one restrained accent, hairline borders over shadows, no hover choreography),
> but the palette, type, and signature element are grounded in this app's own
> subject — books, plates, bindings — not a copy of claude.ai's marketing site.
> Cream + serif + terracotta is one of the three most recognizable
> "an AI designed this" defaults; cloning it verbatim defeats the point of the
> anti-pattern list below.

## Tokens

```css
:root {
  /* surfaces */
  --paper: #F5F0E4;        /* canvas — warm parchment, not pure white */
  --paper-card: #EEE7D6;   /* slightly deeper card surface on paper */
  --library: #1E2B22;      /* dark elevated surface — bottle-green, evokes a
                               cloth cover, not a generic dark-mode gray */
  --library-soft: #263B2D;

  /* text */
  --ink: #211D17;
  --ink-soft: #5C564A;
  --ink-faint: #8A8272;
  --on-library: #EDE7D9;

  /* accent — one color, used sparingly */
  --binding: #7A2E2E;      /* oxblood cloth-binding red — primary actions,
                               current-step state, error semantics */
  --binding-active: #5E2222;

  /* rare highlight — foil accent, "done" mark only */
  --gold-leaf: #A9812E;

  /* structure */
  --hairline: #DED5C0;
  --hairline-soft: #E7E0CC;

  /* state (kept desaturated — no traffic-light pastels) */
  --success: #3E5C3F;
  --warning: #8A6A2A;
  --error: var(--binding);
}
```

```css
/* type roles */
--font-display: "Fraunces", "Source Serif 4", serif;   /* titles, plate captions */
--font-body:    "Work Sans", "Public Sans", sans-serif; /* everything else */
--font-mono:    "JetBrains Mono", ui-monospace, monospace; /* rare: code/JSON */

--display-lg:  32px / 1.15 var(--font-display); /* project title */
--display-md:  24px / 1.2  var(--font-display); /* section heading */
--title:       17px / 1.4  var(--font-body); font-weight: 600;
--body:        15px / 1.55 var(--font-body); font-weight: 400;
--caption:     13px / 1.4  var(--font-body); font-weight: 500;
--plate-cap:   14px / 1.4  var(--font-display); font-style: italic;
```

```css
--radius-sm: 3px;   /* inputs, pills */
--radius-md: 6px;   /* cards — nothing bigger; the bubbly 16–24px "soft
                        corner radius" look reads as templated */
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px;

/* no box-shadow tokens on purpose — hairline borders do all the separation
   work. If a card needs to read as "elevated" (the in-progress step), it
   moves to --library, not a shadow. */
```

## Signature element: the specimen plate

Character portraits and chapter illustrations (`ArtCard`) render like plates
in an old illustrated book, not like product-marketing image cards:

```
┌───────────────────────────┐
│                           │
│         [portrait]        │
│                           │
├───────────────────────────┤
│  Fig. 2                   │  ← caption in --plate-cap, ink-soft
│  Otter, riverbank study    │
└───────────────────────────┘
```

1px `--hairline` frame, `--radius-md`, a plate number in the corner, italic
Fraunces caption underneath. This is the one place to spend visual boldness —
everything else on the page stays quiet.

## Component notes (mapped to your required screens, §4.4)

- **Stepper** — a fixed 5-step sequence is a genuine, earned use of numbering
  (unlike decorative 01/02/03 markers). Render as a table-of-contents rail:
  `I · Style   II · Characters   III · Portraits   IV · Chapters   V · Illustrations`
  in Fraunces. Done = filled dot + `--ink-soft` label. Current = solid
  `--ink` + `--binding` weight/underline. Pending = hairline-only dot.
  No green checkmark icons.
- **StatusPill** — outline pill (`--hairline` border, `--paper-card` fill,
  `--ink` text) with a small solid dot in the semantic color, not a
  saturated background fill. Keeps status legible without turning into a
  pastel badge wall.
- **Banner (in-progress)** — names the exact running step in text (per
  §4.3's requirement), a slow hairline-underline pulse instead of a spinner
  icon. **Banner (error)** — the one place a colored left edge is justified:
  it's a semantic alert convention (errata mark), not card decoration, so it
  stays inside this single component and nowhere else.
- **ProjectListPage rows** — plain rows over a hairline divider, not
  shadowed cards. Title in Fraunces, metadata in `--caption`.
- **Buttons** — one primary style (`--binding` fill, `--on-library` text,
  `--radius-sm`), one secondary (outline, `--paper` fill). No third "ghost"
  variant needed at this scope.

## Anti-pattern mapping (your list of 30)

| Avoid | Do instead here |
|---|---|
| 1 Harsh gradients | Flat fields; contrast comes from --paper → --library, not gradients |
| 2 Lucide icons | No icon library. State is text + dots/weight, not glyphs |
| 3 Pure white bg | --paper (parchment) |
| 4 Rainbow coloring | 4–6 named tokens above, nothing else |
| 5 Drop shadows | Hairline borders only; --library for "elevated" |
| 6 3 feature cards row | N/A — this is an app, not a landing page |
| 7 Emojis | None |
| 8 Liquid glass | Flat surfaces, no blur |
| 9 Em dashes | Write plainly in UI copy and error text |
| 10 Inter/Geist/Space Grotesk as display | Fraunces for display; Work Sans for body only |
| 11 Colored left stripe (decorative) | Reserved for the error banner only, semantically justified |
| 12 Fake testimonials | N/A |
| 13 Bento grids | Plain stacked rows / plate grid |
| 14 Terminal window chrome | N/A |
| 15 "It's not X, it's Y" copy | Avoided in all copy |
| 16 Checkmark bullets | Step state via label + weight/dot, no check icons |
| 17 3 pricing tiers | N/A |
| 18 No real product demos | Opposite — every screen shows real generated portraits/illustrations |
| 19 Soft corner radius | 3–6px max |
| 20 Purple and black | Not in the palette |
| 21 No skeleton loaders | Real per-item loading states are required by §4.3 — include them |
| 22 Radial orbs | None |
| 23 Dot grids | None as decoration |
| 24 Sparkle icons | None |
| 25 Animated arrows | No decorative motion; only real state transitions |
| 26/27 No ToS/privacy | N/A, internal tool |
| 28 Hover animations | State-change only, nothing ambient |
| 29 Neon colors | Not in the palette |
| 30 Basic pastels | Desaturated, book-material tones instead |

## Fonts (public, free)

`Fraunces` and `Work Sans` are both on Google Fonts — self-host them (no CDN
per the assessment's local-only constraint isn't actually stated, but
self-hosting avoids a network dependency in a reviewer's offline run either
way). `JetBrains Mono` likewise.