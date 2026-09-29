/* Class recipes for the /app pages (web revamp C4): one place that says what a card, a section
   title, a tag, an input or a sheet looks like on /app, /app/trips and /app/settings, so the
   surfaces cannot drift apart. They compose the shared kit (app/ui-kit.css) with Tailwind.

   KIT PRECEDENCE — read before composing. ui-kit.css is unlayered CSS; Tailwind v4 utilities live
   in @layer utilities. Unlayered rules WIN, so a utility can never override a property a kit class
   sets. Concretely:
   - .t-meta sets `color`; .t-label sets `font-weight` and `letter-spacing`; every .t-* sets
     font-family/size/line-height. When you need another colour or weight, use the token directly
     (`text-[length:var(--t-meta)]`) instead of the class.
   - .m-btn-*, .m-card-link and .m-pill-badge set colour, background, radius, min-height, padding
     and box-shadow. Add only what they leave unset (width, margin, gap, flex). A destructive or
     otherwise differently coloured button is DESTRUCTIVE_BUTTON below, not an .m-btn-* override.
   - .m-card sets background, radius and shadow; padding is yours. */

/** Serif page title (Settings, My trips, the /app greeting). */
export const PAGE_TITLE = 't-display font-medium text-[color:var(--m-text)]'

/** Serif section heading inside a page or a card. */
export const SECTION_TITLE = 't-title font-medium text-[color:var(--m-text)]'

/** Small caps eyebrow above a section or a group of rows (12px, the scale's floor). */
export const EYEBROW = 't-label uppercase text-[color:var(--m-text-muted)]'

/** Body and secondary copy. */
export const BODY = 'font-[family-name:var(--font-ui)] text-[length:var(--t-body)] leading-[1.5] text-[color:var(--m-text)]'
export const META = 'font-[family-name:var(--font-ui)] text-[length:var(--t-meta)] leading-[1.4] text-[color:var(--m-text-muted)]'

/** A white elevated card: the default container for a section. */
export const CARD = 'm-card p-5'

/** A calm tinted block inside a card (quotes, prompts, secondary groups). No outline. */
export const SUBCARD = 'm-subcard p-4'

/** Grouped rows inside one card, iOS-settings style: rows are separated by hairlines. */
export const ROW_GROUP = 'm-card flex flex-col divide-y divide-[color:var(--line-soft)] overflow-hidden'

/** A row inside ROW_GROUP (a link or a button): 56px, icon + text, trailing chevron via .m-chevron. */
export const GROUP_ROW =
  'flex min-h-14 w-full items-center gap-3 px-4 text-left font-[family-name:var(--font-ui)] text-[length:var(--t-body)] text-[color:var(--m-text)] transition-colors duration-[var(--m-dur-press)] hover:bg-[color:var(--m-subcard)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--m-accent)] motion-reduce:transition-none disabled:opacity-50'

/** A neutral tag / chip (status, budget, count). 12px, never smaller. */
export const TAG =
  'inline-flex min-h-6 items-center gap-1.5 rounded-[var(--m-r-pill)] bg-[color:var(--m-subcard)] px-2.5 font-[family-name:var(--font-ui)] text-[length:var(--t-label)] font-semibold text-[color:var(--m-text-muted)]'

/** An accent tag for provenance ("Memory", "From your Reels"). */
export const ACCENT_TAG =
  'inline-flex min-h-6 items-center gap-1.5 rounded-[var(--m-r-pill)] bg-[color:var(--m-accent-wash)] px-2.5 font-[family-name:var(--font-ui)] text-[length:var(--t-label)] font-semibold text-[color:var(--m-accent)]'

/** Text input / textarea: white, soft inset hairline, kit focus ring. Add w-full or a width. */
export const INPUT =
  'min-h-12 rounded-[var(--m-r-sub)] bg-[color:var(--m-card)] px-4 font-[family-name:var(--font-ui)] text-[length:var(--t-body-lg)] text-[color:var(--m-text)] shadow-[inset_0_0_0_1px_var(--line-soft)] placeholder:text-[color:var(--m-text-muted)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] disabled:opacity-60'

/** Low-emphasis text action (a "link" that does something): 44px tall, ink, wash on hover. */
export const TEXT_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--m-r-pill)] px-3 font-[family-name:var(--font-ui)] text-[length:var(--t-meta)] font-semibold text-[color:var(--m-text)] transition-colors duration-[var(--m-dur-press)] hover:bg-[color:var(--m-accent-wash)] focus-visible:outline-none focus-visible:shadow-[var(--m-focus)] motion-reduce:transition-none disabled:opacity-50'

/** Destructive action: white pill, red label and ring. Visually distinct from every kit button. */
export const DESTRUCTIVE_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--m-r-pill)] bg-[color:var(--m-card)] px-5 font-[family-name:var(--font-ui)] text-[length:15px] font-semibold text-[color:var(--fail)] shadow-[inset_0_0_0_1.5px_var(--fail)] transition-transform duration-[var(--m-dur-press)] active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--fail),var(--m-focus)] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50'

/** Modal backdrop. The panel inside is DIALOG_PANEL. */
export const DIALOG_BACKDROP = 'fixed inset-0 z-50 flex items-end justify-center bg-[rgba(28,23,16,0.45)] md:items-center md:p-4'

/** Placify sheet as a dialog: a bottom sheet with a handle on phones, a centred 28px card from 768. */
export const DIALOG_PANEL =
  'relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--m-r-sheet)] bg-[color:var(--m-page)] pb-[env(safe-area-inset-bottom)] text-[color:var(--m-text)] shadow-[var(--m-shadow-2)] md:max-w-lg md:rounded-[var(--m-r-sheet)] md:pb-0'

/** The phone grab handle at the top of a sheet (decorative; hidden from 768). */
export const SHEET_HANDLE = 'mx-auto mt-2.5 h-1.5 w-10 flex-none rounded-full bg-[rgba(28,23,16,0.18)] md:hidden'

/** A sheet floating over a full-bleed map (tray, plan): bottom on phones, a left panel from 768. */
export const MAP_SHEET =
  'absolute z-20 flex flex-col overflow-hidden bg-[color:var(--m-page)] text-[color:var(--m-text)] shadow-[var(--m-shadow-2)] inset-x-0 bottom-0 rounded-t-[var(--m-r-sheet)] md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:w-[420px] md:rounded-[var(--m-r-sheet)]'
