# src/ds: the design system

Every screen is built from this folder: the product, Agent Ops, the walkthrough, the hub and the
write-up. It holds the tokens, the components and the app frame. The code is the source of truth.
[docs/DESIGN.md](../../docs/DESIGN.md) explains the intent and the rules the code cannot enforce.

## Read first

- `tokens.css`: every colour, type size, space, radius, shadow and duration.
- `index.ts`: import components from here (`import { Button } from '../ds'`). Importing it also
  loads `tokens.css` and `ds.css`.
- `ds.css`: the component styles. Class names start with `ds-`.

## Files

| File | What's in it |
|---|---|
| `primitives.tsx` | Buttons, badges, avatars and other small pieces |
| `layout.tsx` | `Page`, `PageHeader`, `Section`, `Card`, `Toolbar`, `Grid` |
| `forms.tsx` | Inputs, selects, switches, checkboxes, segmented controls, tabs |
| `data.tsx` | Tables, stats, key/value lists, meters, `Quote`, `Callout`, empty states, skeletons |
| `overlay.tsx` | Tooltip, menu, popover, dialog (`Modal`), drawer, toasts (built on Floating UI) |
| `marks.tsx` | Product marks and connector marks |
| `icons.tsx` | The icon set. Import it from `src/ds/icons`, not from `index.ts` |
| `shell/Shell.tsx`, `shell.css` | The frame Switchboard and Agent Ops share: sidebar, top bar, phone drawer |
| `time/` | Relative times, the time zone context and date formatting |

## How it connects

- `src/app/AppShell.tsx` and `src/platform/PlatformShell.tsx` each configure `Shell` for their
  product.
- Domain badges built on these components live in `src/app/components/domain.tsx`.
- The presentation layer (`src/narrative/`, `src/web/`, `src/tour/`) reads the same tokens.

## Change it safely

- No raw colours anywhere. Read a token, or add one here and document it in `docs/DESIGN.md`.
- No new component libraries. Extend a component here rather than restyling it on one page.
- One light theme, Inter only, sentence case. Motion is short and functional, and reduced motion
  turns it off.
- Pages must work at 1440, 1024 and 390 wide with no overlaps, clipping or horizontal scroll.
- Tests: `npm run typecheck`, then `npx playwright test --project=app --project=tour-desktop`.
  Check changed components on screen at all three widths.
