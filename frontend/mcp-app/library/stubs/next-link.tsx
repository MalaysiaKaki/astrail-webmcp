// Stand-in for next/link, which reads process.env.__NEXT_* at module scope and crashes in the
// widget's browser load. The widget never renders it (MobileMapControls imports it for a website-only link).
import type { AnchorHTMLAttributes } from 'react'

export default function Link({ href, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | { pathname?: string } }) {
  return <a href={typeof href === 'string' ? href : '#'} {...rest} />
}
