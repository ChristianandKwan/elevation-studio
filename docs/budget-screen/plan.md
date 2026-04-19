# Budget Tab — Implementation Plan

Status: **Awaiting sign-off** (as of 2026-04-19)

This is the working plan for adding a Budget tab to Elevation Studio. It consolidates the design work in `brief.md`, `spec.md`, and `prototype.html` into a concrete engineering roadmap.

---

## Scope in one paragraph

Add a new "Budget" tab to both the consultant studio and the client portal, rendering the gallery-style ledger documented in `spec.md`/`prototype.html`. Fix the existing Cormorant Garamond font typo across the app as part of the same work. Update the Artwork data model to carry an `artist` field and a `framingStatus` / `framingCost` pair (replacing the older `priceIncludes` flag, which has no production data behind it yet). Add a new `project_budgets` row per project to hold installation state, consultant fee, custom line items, and the client-facing VAT default. Ship PDF export as a print-stylesheet-plus-`window.print()` approach for v1.

---

## Phasing

**Phase 1 — Foundation: font fix + data model**
Fix `Cormorant+Garant` → `Cormorant+Garamond` in `src/app/layout.tsx` and `src/app/globals.css` (nine occurrences). Update the `Artwork` TypeScript type to add `artist`, `framingStatus`, `framingCost`; drop `priceIncludes`. Add new `ProjectBudget`, `BudgetInstallation`, `BudgetConsultantFee`, `BudgetCustomLineItem` types. Create the Supabase migration that adds the new artwork columns and the new `project_budgets` table. No UI work yet.

**Phase 2 — Add Artwork modal**
Update `AddArtworkModal` to capture artist name, framing status (Framed / Requires framing), and framing cost (visible only when "Requires framing"). Update `StudioSidebar` artwork rows to display artist name. Remove any UI that references the old `priceIncludes` flag.

**Phase 3 — Budget tab (consultant view)**
Build the Budget component family under `src/components/budget/`: `BudgetScreen`, `BudgetHeader`, `ElevationSection`, `OptionBlock`, `ArtworkLine`, `InstallationRow`, `ConsultantFeeRow`, `CustomLineItems`, `TotalsPanel`, plus a `useBudgetState` hook for Supabase persistence (debounced save, save-status indicator in the header). Add `.budget-*` classes to `globals.css` following existing naming conventions — no inline styles. Wire the tab into `StudioScreen.tsx`.

**Phase 4 — Client portal parity**
Render the same `BudgetScreen` in the client portal with `isConsultant={false}`. Hide consultant-only affordances and filter out consultant-fee / custom-lines where `shownToClient === false`. Add a "Preview as client" affordance in the consultant header so the "Client view" badge only appears when a consultant is previewing (never for a real client opening their own portal).

**Phase 5 — PDF export**
Add an "Export PDF" button in the consultant header that calls `window.print()`. Add a `@media print` block to `globals.css` that hides chrome (buttons, tabs), resets the container to full width, and ensures clean page breaks between elevations. Upgrade path to server-side generation (e.g. Puppeteer) is noted but out of scope for v1.

---

## Data model

**TypeScript changes (`src/types/index.ts`)**

`Artwork` gains: `artist: string`, `framingStatus: 'framed' | 'requires_framing'`, `framingCost: number | null`. Loses: `priceIncludes`.

New types:

```ts
interface BudgetInstallation {
  indicative: boolean
  confirmedAmount: number | null
}

interface BudgetConsultantFee {
  mode: 'flat' | 'percentage'
  amount: number          // £ when flat, % as number (e.g. 15 = 15%) when percentage
  shownToClient: boolean
}

interface BudgetCustomLineItem {
  id: string
  name: string
  amount: number
  vatApplies: boolean     // default true on creation
  shownToClient: boolean  // default true on creation
}

interface ProjectBudget {
  id: string
  projectId: string
  installation: BudgetInstallation
  consultantFee: BudgetConsultantFee | null
  customLineItems: BudgetCustomLineItem[]
  vatIncludedDefault: boolean   // consultant sets the default for the client view
  createdAt: string
  updatedAt: string
}
```

**Supabase migration**

- `artworks` table: add `artist text not null default ''`, `framing_status text not null default 'framed'` (check constraint `in ('framed','requires_framing')`), `framing_cost integer nullable`. Drop `price_includes`.
- New `project_budgets` table with one row per project, referenced by `project_id` FK. Columns mirror the TypeScript model; `custom_line_items` stored as `jsonb` array.
- No production data exists, so no backfill script needed.

**Breaking changes**

`AddArtworkModal` and `StudioSidebar` both reference `priceIncludes` today; both will be updated. The Supabase `select` query used by the project page will need the new columns.

---

## Component layout

```
src/components/budget/
├── BudgetScreen.tsx
├── BudgetHeader.tsx
├── ElevationSection.tsx
├── OptionBlock.tsx
├── ArtworkLine.tsx
├── InstallationRow.tsx
├── ConsultantFeeRow.tsx
├── CustomLineItems.tsx
├── TotalsPanel.tsx
└── useBudgetState.ts
```

`BudgetScreen` takes `isConsultant: boolean` and `isPreviewingClientView: boolean`. Those two props drive every view-level divergence (the "Client view" badge, the inline edit links, the add-line-item affordance, the show-to-client filter on custom items and the consultant fee).

---

## State management

Budget state is owned by `useBudgetState`, which hydrates from `project_budgets` on mount, persists edits with a 500 ms debounce, and surfaces a `saving | saved | error` status that `BudgetHeader` renders in the same style as the existing studio save indicator. VAT-toggle state is session-only, kept in `localStorage` as `elevation_budget_vat_mode_{projectId}` so the preference survives refresh without being shared across projects. The consultant's default VAT mode for the client lives on the `project_budgets` row and seeds the client's initial value.

---

## Routing & tab integration

No URL changes. `StudioScreen.tsx` picks up a new top-level view toggle — **Studio** (the existing canvas + elevation tabs) vs **Budget** (the new screen). The existing elevation-option tab bar remains the Studio sub-navigation and disappears when Budget is active. The client portal gets the same **Elevations / Budget** split.

---

## CSS strategy

Add a `.budget-*` family of classes in `globals.css` following the existing `.studio-*` / `.client-*` naming. Reuse existing tokens (`--cream`, `--charcoal`, `--accent`, `--border`, `--green`, `--mid`, etc.) — nothing new in the token set. Include a `@media print` block with: hide `.budget-export-btn`, `.studio-tab-bar`, `.client-tab-bar`, drop `.budget-header { position: sticky }`, reset container max-width, force page-break-inside: avoid on each `.budget-elev-block`.

No inline styles; the prototype's inline-style pattern doesn't survive the transition to the real app.

---

## PDF export

v1: `window.print()` + print stylesheet. Zero dependencies, works everywhere, user gets the native "Save as PDF" dialog. Known trade-offs: the user has to confirm a dialog, and we can't pre-fill a filename (browsers use page title, so we'll set a descriptive `<title>` during print). If the consultancy outgrows this (e.g. they want an automated emailed PDF), we graduate to server-side Puppeteer later without any change to the Budget UI code.

---

## Resolved decisions (2026-04-19)

1. **Confirmed installation stays locked.** Once the consultant marks an installation figure as confirmed, it does not snap back to an indicative range if the artwork count later crosses a tier boundary. The reasoning: that figure has effectively been quoted to the client.
2. **Consultant fee mode is freely switchable.** The consultant can flip between flat amount and percentage at any time — same project, same screen. This pairs with the existing "Shown to client" toggle on the fee row.
3. **VAT-toggle preference is per project.** Stored as `elevation_budget_vat_mode_{projectId}` in `localStorage`.
4. **`project_budgets` row is created lazily** on first Budget-tab load for the project.

## Added scope: client budget + variance

A new feature captured after the initial plan: a project can optionally carry a client-stated budget, and the Budget screen displays the current total against it as a variance figure below the grand total. Many projects will not have a stated budget — the feature is fully optional.

**Data model**
- Add `clientBudget: number | null` to `Project`. `null` means no budget has been set.
- Stored on the `projects` table as `client_budget integer nullable`. Canonical ex-VAT amount; Inc-VAT display applies `× 1.2`.

**Entry**
- New project modal carries an optional `Client budget (£)` field. Leaving it blank creates a project without a budget.
- Editable at any time on the Budget screen itself (no lock — scope can shift mid-project, and clients sometimes add a budget after kick-off).
- When `clientBudget === null` and the consultant is viewing the Budget screen, show an unobtrusive `+ Set a client budget` affordance in the Summary section. Clicking reveals an inline input. For the client view with `clientBudget === null`, the row is not rendered at all.

**Display (below the grand total row in TotalsPanel, when set)**
- Row: "Client budget" — label on the left, figure on the right, Karla 13 px matching the other summary rows. Visible to both consultant and client.
- Variance row underneath — slightly larger (Karla 14 px, medium weight) with a descriptive label such as "£2,500 over budget" or "£3,000 under budget".
- Colour logic:
  - Whole total under client budget → green (`--green`)
  - Whole total over client budget → red (`--red`)
  - Range straddles the budget line → amber/accent (`--accent`)
  - Fully picked and exactly on budget → neutral (`--mid`)

**Range handling (when some elevations are unpicked)**
- Best-case / worst-case pair. Two small sub-lines:
  - "Best case: £2,000 under budget" (green)
  - "Worst case: £3,000 over budget" (red)

---

## Risks

- **Partial merge of the font fix leaves the app looking worse than before.** Mitigation: land font fix + data model as a single PR at the start of Phase 1.
- **Supabase save failure going unnoticed.** Mitigation: save-status indicator in the header, same pattern as the existing studio save state.
- **Range rounding drift.** Every figure rounded via `Math.round()` at the formatting boundary only, not mid-calculation.
- **Client token security.** Budget data must be scoped to the project the token authorises — verify in the fetch query, not just on the client side.
- **Print CSS browser drift.** Test Chrome, Safari, Firefox before shipping Phase 5.

---

## Verification strategy

Manual walk-through of the six core states from `spec.md` (early / partial / full × consultant / client), each tested under Ex-VAT and Inc-VAT, plus indicative-vs-confirmed installation, plus the consultant-fee-shown-to-client toggle, plus a custom line with `vatApplies=true`. Automated unit coverage for `installRange(count)`, VAT rounding, and the range-vs-single-figure logic on the grand total.
