# Elevation Studio — Project Budget Screen

Design brief for Claude Design (or any other design tool). Copy-paste this as the opening prompt.

---

## The app in one paragraph

Elevation Studio is an internal tool for Christian & Kwan, a small art consultancy based in the UK. Consultants upload photos of client walls ("elevations"), scale them to real-world dimensions, and drop artwork images onto them so the client can see proposed pieces in situ. The client receives a shared link and picks between Option A and Option B for each elevation. The app should feel elegant, robust and simple — more gallery website than SaaS dashboard.

## Design system (please use faithfully)

**Palette**
- Cream background: `#F7F4EF`
- Warm white panels: `#FDFBF9`
- Charcoal (primary text, primary button fill): `#1C1A18`
- Muted accent brown: `#8B6F47`
- Borders: `#E3DED7`
- Mid-grey (secondary text): `#7A746E`
- Success green: `#2E6B4F`
- Danger red: `#b94040`

**Typography**
- Headings, small-caps labels, elevation names: **Cormorant Garant** (serif)
- Body, UI controls, numbers: **Karla** (sans)

**Feel**
- Quiet, gallery-like, lots of whitespace
- Thin 1px borders rather than shadows (shadows only on floating panels)
- Rectangular buttons with thin borders; primary = charcoal fill, white text
- Small-caps uppercase labels (`.dash-kicker` style) for section headings: 10.5px, letter-spacing .14em, mid-grey
- Think Dia Art Foundation or Hauser & Wirth, not Stripe

## What the screen is

A "Budget" tab inside a project. Both consultant and client see essentially the same screen. Differences:

- Consultant can add a **consultant fee** line (with a "Shown to client" toggle)
- Consultant can add **custom line items** (each with show-to-client and VAT-applies toggles)
- Consultant can **export to PDF**
- Client can see, but cannot edit
- Both sides have a **Ex-VAT / Inc-VAT** toggle; the consultant sets the client's default, the client can override

## Sections required

**Header strip**
- Project name, client name
- Ex-VAT / Inc-VAT toggle (top right)
- Export PDF button (consultant only)

**Per-elevation breakdown**
- One section per elevation
- If the client has already picked an option: show that option's exact total, and the artwork list beneath
- If not yet picked: show **both** option totals side by side (not a min–max range, show them labelled: "Option A £12,400" / "Option B £15,800"), with the artwork list for each expandable
- Hidden artworks are excluded from both the list and the totals

**Artwork lines**
- Artwork name, dimensions, base price
- If the artwork is marked "requires framing", show a framing cost line directly beneath it (e.g. "+ Framing £320")
- If the artwork is marked "framed", no framing line

**Installation (indicative)**
- Appears once, in the project-level totals panel. **Not** shown inside any per-elevation block.
- Labelled "Installation (indicative)" with a subtle badge
- Calculated from the total number of visible artworks in the project:
  - 1–5 artworks: £125–£185
  - 6–15 artworks: £250–£350
  - 16–30 artworks: £600–£700
  - Each additional 15 artworks: +£350
- Consultant can override with a confirmed figure; when they do, the "indicative" badge is replaced with a "confirmed" badge

**Consultant fee** (consultant view only by default)
- Either a flat amount or a percentage of the artwork subtotal — consultant picks the mode
- "Shown to client" toggle — when on, the line appears on the client view too

**Custom line items** (consultant view)
- Consultant adds any additional cost (delivery, crating, commission, etc.)
- Each has: name, amount, VAT-applies y/n, show-to-client y/n

**Totals panel**
- Subtotal: artworks
- Subtotal: framing
- Installation
- Other / custom lines
- Consultant fee (if shown)
- VAT (at 20%)
- **Grand total** — a single figure if all options are picked, a range if any are not

## States to design

Please produce variants for:

1. **Early draft** — no options picked by client; totals are ranges; Option A and Option B shown side by side on every elevation
2. **Partially chosen** — one elevation picked, one not; mixed exact + range
3. **Fully chosen** — all exact figures
4. **Consultant view with fee visible** vs **client view with fee hidden**
5. **Ex-VAT mode** vs **Inc-VAT mode**
6. **With confirmed installation** — "indicative" badge replaced by "confirmed"

## What to avoid

- SaaS dashboard vibes (multi-coloured cards, progress bars, stat tiles)
- Excel-like row density
- Charting / sparklines / graphs
- Anything that looks like Xero, QuickBooks or FreshBooks
- Shouty "TOTAL: £X" blocks — the grand total matters but should sit quietly, serif, restrained
- Bold colour fills for status (use the muted `--amber-light` / `--green-light` palette if status pills are needed)

## What to produce

Two or three layout options for the **default consultant view, partial-picked state**. Focus on how the per-elevation blocks, the installation row, the custom lines, and the totals panel sit together. Keep the same palette and type system; variants should differ in layout and hierarchy, not in colour.
