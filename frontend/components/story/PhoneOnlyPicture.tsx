/* An image only a phone downloads (plan amendment 9).

   Both <source>s carry the kit's phone query, so a desktop browser matches neither and resolves
   the <img> fallback instead, which is a 1x1 data GIF: the markup is present on desktop (and
   hidden there by the caller's m-phone-only) but the file is never requested. `base` is the path
   without an extension; `<base>.avif` and `<base>.webp` must both exist under public/.
   `width`/`height` are the encoded file's real pixel size, so the box is reserved before load. */

export const PHONE_MEDIA = '(max-width: 767.98px)'
/* The mirror image (phase B6): an image only a desktop downloads, e.g. the hero's framed trip. */
export const DESKTOP_MEDIA = '(min-width: 768px)'

const NOTHING = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export default function PhoneOnlyPicture({
  base,
  width,
  height,
  alt,
  className,
  priority = false,
  media = PHONE_MEDIA,
}: {
  base: string
  width: number
  height: number
  alt: string
  className?: string
  priority?: boolean
  /** Which widths may fetch the file; defaults to phones. Other widths get the 1x1 fallback. */
  media?: string
}) {
  return (
    <picture>
      <source media={media} type="image/avif" srcSet={`${base}.avif`} />
      <source media={media} type="image/webp" srcSet={`${base}.webp`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot express a
          media-gated <picture>; the phone-only fetch is the point of this markup. */}
      <img
        className={className}
        src={NOTHING}
        width={width}
        height={height}
        alt={alt}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
      />
    </picture>
  )
}
