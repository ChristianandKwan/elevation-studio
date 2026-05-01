# Handoff: Budget Screen — Elevation Studio

## Overview

This is the **Budget** tab inside a project in Elevation Studio, an internal tool for Christian & Kwan, a UK art consultancy. Consultants upload photos of client walls ("elevations"), place artwork proposals on them, and share a budget summary with the client. This screen shows a full cost breakdown per elevation, installation, consultant fees, custom line items, and a grand total.

The design is gallery-like in register — closer to Dia Art Foundation or Hauser & Wirth than any SaaS dashboard. Lots of whitespace, 1px borders rather than shadows, serif headings, and quiet typography.

## About the Design Files

The files in this bundle are **high-fidelity design references built in HTML/React**. They are prototypes showing the intended look, typography, interactions, and state logic — not production code to copy directly. The task is to **recreate these designs in the target codebase's existing environment** using its established patterns and libraries, matching the visual output as closely as possible.

## Fidelity

**High-fidelity.** Pixel-accurate colours, typography, spacing, and interactions. Implement to match exactly — including hover states, inline editing, badge variants, and the VAT toggle behaviour.

---

## Design Tokens

### Colours

| Token | Hex | Usage |
|---|---|---|
| `--cream` | `#F7F4EF` | Page background |
| `--panel` | `#FDFBF9` | Card / panel background, option blocks |
| `--charcoal` | `#1C1A18` | Primary text, header bg, primary buttons, Total label |
| `--brown` | `#8B6F47` | Accent — pending badge, inline edit links, wavy icon |
| `--border` | `#E3DED7` | All 1px dividers and borders |
| `--mid` | `#7A746E` | Secondary text, artwork artist name, dims, row sub-labels |
| `--green` | `#2E6B4F` | Confirmed / picked indicator, tick icon |
| `--red` | `#b94040` | Danger (reserved — not yet used in this screen) |

### Typography

| Role | Font | Size | Weight | Other |
|---|---|---|---|---|
| Elevation names | Cormorant Garamond | 20px | 600 | — |
| Artwork titles | Cormorant Garamond | 15px | 400 | — |
| Option totals (picked) | Cormorant Garamond | 20px | 400 | — |
| Option totals (pending blocks) | Cormorant Garamond | 18px | 400 | — |
| Total figure | Cormorant Garamond | 26px | 500 | — |
| Project name (header) | Cormorant Garamond | 21px | 400 | — |
| Section kickers (Elevations / Additional costs / Summary) | Karla | 11px | 700 | uppercase, letter-spacing 0.16em, charcoal |
| Small kickers (Option A/B label, Shown to client, etc.) | Karla | 10.5px | 500 | uppercase, letter-spacing 0.14em, `--mid` |
| Body / UI / numbers | Karla | 14px | 400 | — |
| TOTAL label | Karla | 26px | 700 | uppercase, letter-spacing 0.12em, charcoal |
| Artwork artist / dims | Karla | 12px | 400 | `--mid` |
| Framing sub-line | Karla | 12px | 400 | `--mid`, italic |
| Summary row labels | Karla | 13px | 400 | `--mid` |
| Summary row values | Karla | 13px | 400 | charcoal |
| Header client name / breadcrumb | Karla | 11.5px | 400 | `rgba(255,255,255,0.45)` (on dark header) |

---

## Layout

**Single-column ledger layout.** Max-width 780px, centred, padding 44px top/bottom 40px sides.

### Header (sticky, full-width)
- Background: `--charcoal`
- Height: ~56px with 15px top/bottom padding, 40px left/right
- Left: Project name (serif 21px white) + client name below (Karla 11.5px, 45% white opacity)
- Right: VAT toggle + Export PDF button (consultant only)
- The "Client view" label appears inline next to the project name when in client view — small uppercase Karla badge, 45% white border

### VAT Toggle (in header)
- Two-segment control: "Ex VAT" / "Inc VAT"
- Inactive: transparent bg, 50% white text
- Active: `rgba(255,255,255,0.15)` bg, white text
- Border: `1px solid rgba(255,255,255,0.25)` around the whole control

### Body content (below header)
Three sections stacked vertically, separated by the kicker labels:

1. **Elevations** — one block per elevation
2. **Additional costs** — Installation, Consultant fee, Custom line items
3. **Summary** — totals table

Section kickers sit 44px above their first child (for Summary), 8px above for Additional costs.

---

## Screens / States

### Elevation Block — Picked

When the client has selected an option for this elevation:

- No container border or background — flows inline in the page
- Header row (flex, align baseline):
  - Left: Elevation name — Cormorant Garamond 20px weight 600
  - Centre: `✓ Option A` — green SVG tick (11×11) + Karla 10.5px uppercase, `--green`, letter-spacing 0.1em
  - Right: Total — Cormorant Garamond 20px weight 400
- Below header: 1px `--border` divider
- Then: artwork lines (see below)
- Block margin-bottom: 28px

### Elevation Block — Selection Pending

When the client has not yet chosen between Option A and B:

- No container border or background — flows inline
- Header row:
  - Left: Elevation name — Cormorant Garamond 20px weight 600
  - Right: Wavy SVG icon (16×8, 3-bump sine wave path) + "Selection pending" — Karla 10.5px uppercase, `--brown`, letter-spacing 0.1em
  - The wavy SVG path: `M1 4 Q2.75 1 4.5 4 Q6.25 7 8 4 Q9.75 1 11.5 4 Q13.25 7 15 4`, stroke `--brown`, strokeWidth 1.4, strokeLinecap round
- Below: two **Option Blocks** side by side (gap 10px), each `flex: 1`

### Option Block (A or B)

Used inside a pending elevation:

- Border: `1px solid --border`
- Background: `--panel`
- Header (clickable, toggles artwork list):
  - "Option A" / "Option B" kicker (left)
  - Option total — Cormorant Garamond 18px (right)
  - Chevron ▾ rotates 180° when expanded — transition 0.2s
- Artwork list: rendered below header when expanded, padding 0 16px
- Default state: expanded

### Artwork Line

Each artwork in an option or resolved elevation:

- Flex row, padding 10px 0, border-bottom `1px solid --border`
- Left: title (Cormorant Garamond 15px) + artist (Karla 12px `--mid`, margin-left 8px)
- Centre: dimensions (Karla 12px `--mid`, flex-shrink 0)
- Right: price (Karla 14px, min-width 68px, text-right)

If artwork **requires framing**: a sub-line immediately below, indented 18px left:
- "＋ Framing" in Karla 12px italic `--mid` (left)
- Framing cost Karla 12px `--mid` (right)
- Border-bottom: `1px solid --border`

### Installation Row

Sits in Additional costs, full-width flex row:

- Label: "Installation" — Karla 14px
- Badge: "Indicative" (amber) or "Confirmed" (green) — see Badge spec below
- If consultant + indicative: underlined link "Confirm figure" in `--brown`, 11px
- If consultant + confirmed: underlined link "Edit" in `--brown`
- Value (right): either a range `£125 – £185` or a single figure — Karla 14px

When editing (consultant only):
- Inline £ prefix + input (80px wide, `1px solid --border`, `--panel` bg) + "Save" primary button + "Cancel" ghost button

**Indicative ranges** (based on total visible artwork count):
- 1–5 artworks: £125–£185
- 6–15 artworks: £250–£350
- 16–30 artworks: £600–£700
- Each additional 15: +£350

### Consultant Fee

Same row pattern as Installation. Only visible in consultant view, or in client view if "Shown to client" is toggled on by consultant.

Consultant view extras:
- Checkbox + "Shown to client" kicker label
- "Edit" underlined link → inline edit (same pattern as Installation)

### Custom Line Items

Below consultant fee. Each row:
- Label (left, Karla 14px)
- Badges: "VAT" (amber) and/or "Client" (neutral) — consultant view only
- Amount (right, Karla 14px)
- × remove button — Karla 16px `--mid`, consultant only

"+ Add line item" link at bottom (consultant only) opens an inline form row with: description input, amount input, VAT checkbox, Show to client checkbox, Add button, Cancel button.

### Summary / Totals

A stacked table at the bottom:

Rows (flex, padding 7px 0, border-bottom `1px solid --border`):
- Artworks
- Framing (only if any framing in resolved options)
- Installation
- Other (if custom lines exist)
- Consultant fee (if consultant or fee shown to client)
- VAT 20% (only in Inc VAT mode, styled `--mid`)

Grand Total row:
- `2px solid --charcoal` border-top, padding-top 13px
- Left: "TOTAL" — Karla 26px bold uppercase, letter-spacing 0.12em, charcoal
- Right: figure — Cormorant Garamond 26px weight 500
- If any elevations unpicked: show range `£X – £Y`
- If all picked: show single figure
- Below (Ex VAT mode only): "Excluding VAT" kicker right-aligned

---

## Badge Variants

| Variant | Background | Foreground | Border |
|---|---|---|---|
| `indicative` | `rgba(139,111,71,0.09)` | `--brown` | `rgba(139,111,71,0.28)` |
| `confirmed` | `rgba(46,107,79,0.08)` | `--green` | `rgba(46,107,79,0.28)` |
| `neutral` | transparent | `--mid` | `--border` |
| `pending` | `rgba(139,111,71,0.06)` | `--brown` | `rgba(139,111,71,0.2)` |

All badges: Karla 10px, uppercase, letter-spacing 0.09em, padding 1px 7px, line-height 18px.

---

## Interactions & Behaviour

### VAT Toggle
- Switches all displayed figures between Ex-VAT and Inc-VAT (×1.2) instantly
- VAT row in Summary only visible in Inc-VAT mode

### Option Block expand/collapse
- Clicking the Option Block header toggles the artwork list
- Chevron rotates 180° (CSS transition 0.2s)
- Default: expanded

### Installation inline edit (consultant only)
- "Confirm figure" / "Edit" link → replaces value with: `£` prefix + 80px input + Save + Cancel
- Save: stores value, sets badge to "Confirmed"
- Cancel: reverts

### Consultant fee inline edit (consultant only)
- Same inline edit pattern

### Custom line item add
- "+ Add line item" → inline form row
- Add: appends to list, collapses form
- Cancel: collapses form

### Export PDF (consultant only)
- Ghost button in header. Implementation TBD — should trigger print-ready layout.

---

## Views

### Consultant view
- Sees: consultant fee row (with show-to-client toggle), custom line item controls (add/remove, VAT/client badges), "Confirm figure" / "Edit" links on installation, Export PDF button
- Cannot see: "Client view" badge in header

### Client view
- Sees: consultant fee only if "Shown to client" is on; custom lines only if `shownToClient: true`; no editing controls; no Export PDF; "Client view" badge next to project name in header

---

## State Machine

| `appState` | Elevation 1 | Elevation 2 | Elevation 3 |
|---|---|---|---|
| `early` | pending | pending | pending |
| `partial` | picked → Option A | pending | pending |
| `full` | picked → Option A | picked → Option B | picked → Option A |

The client's actual selection UI (clicking to choose between A and B) is not yet implemented — that is the next feature to build.

---

## Files in this package

| File | Description |
|---|---|
| `Budget Screen.html` | Full self-contained hi-fi prototype. Open in any browser. All interactions are live. Use the Tweaks panel (bottom-right) to switch state, view, and VAT mode. |
| `README.md` | This document |
