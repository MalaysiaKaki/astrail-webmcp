'use client'

import PhoneOnlyPicture from '../PhoneOnlyPicture'

/** A phone-only crop of the same screenshot (public/landing-mobile, made by the harness's
 *  crop-steps.mjs). `width`/`height` are the encoded file's real size; `mapCredit` adds the
 *  Mapbox/OSM line under crops that show a map. */
export type PhoneCrop = { base: string; width: number; height: number; mapCredit?: boolean }

/* A swap-ready frame for a real app screenshot. Until the capture lands, it
   renders a labeled placeholder panel; drop the file into
   public/landing/screens/ and pass its src — nothing else changes.
   Framed like a browser window so real UI reads as real UI.

   PHONES (< 768px, Placify-pattern revamp phase B2): with a `phone` crop, story.css hides the
   browser chrome and the 16:10 desktop shot (lazy, so a phone never fetches it) and shows the
   crop instead, as a rounded card image. Desktop renders exactly as before. */
export default function ShotSlot({
  src,
  label,
  alt,
  className,
  phone,
}: {
  src?: string
  label: string
  alt: string
  className?: string
  phone?: PhoneCrop
}) {
  return (
    <figure
      data-phone-crop={phone ? 'true' : undefined}
      className={`story-shot overflow-hidden rounded-xl border border-[color:var(--paper-line)] bg-[color:var(--paper-0)] shadow-[0_1px_2px_rgba(28,23,16,0.08),0_16px_40px_rgba(28,23,16,0.14)] ${className ?? ''}`}
    >
      {/* browser chrome strip */}
      <div className="story-shot__chrome flex items-center gap-1.5 border-b border-[color:var(--paper-line)] bg-[color:var(--paper-2)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--paper-line-2)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--paper-line-2)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--paper-line-2)]" />
        <span className="ml-3 font-mono text-[11px] tracking-wide text-[color:var(--ink-400)]">
          astrail.app
        </span>
      </div>
      {src ? (
        /* 1440x900 capture = 16:10. Reserving the ratio keeps the card at
           full size before the lazy image arrives — no strip-collapse, no
           layout jump when it lands. */
        <img
          src={src}
          alt={alt}
          className="story-shot__desktop block aspect-[16/10] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="flex aspect-[16/10] items-center justify-center border-2 border-dashed border-[color:var(--paper-line-2)] m-3 rounded-lg"
        >
          <p className="px-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ink-400)]">
            {label}
          </p>
        </div>
      )}
      {phone ? (
        <div className="story-shot__phone m-phone-only">
          <PhoneOnlyPicture
            base={phone.base}
            width={phone.width}
            height={phone.height}
            alt={alt}
            className="story-shot__phone-img"
          />
          {phone.mapCredit ? (
            <p className="story-shot__credit">Map &copy; Mapbox &copy; OpenStreetMap</p>
          ) : null}
        </div>
      ) : null}
    </figure>
  )
}
