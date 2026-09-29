'use client'

import { TALLY_FEEDBACK_URL } from '@/lib/tally'
import { useSignOut } from '@/lib/shell/sign-out'
import { ChatIcon, ChevronRightIcon, ExternalLinkIcon, LogOutIcon } from '@/components/dashboard/nav-icons'

/* Feedback and Log out as kit card-link rows. On a phone these are the only way to reach either
   (the tab bar holds destinations, not actions), so they depend on nothing Settings loads: the
   parent renders them outside its profile/preferences states. */
export default function AccountRows() {
  const signOut = useSignOut()
  return (
    <section aria-labelledby="settings-account" className="flex flex-col gap-3">
      <h2 id="settings-account" className="t-label px-1 uppercase text-[color:var(--m-text-muted)]">
        Account
      </h2>
      <a href={TALLY_FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="m-card-link">
        <ChatIcon className="h-5 w-5 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="t-body font-semibold">Send feedback</span>
          <span className="t-meta">Opens the form in a new tab</span>
        </span>
        <ExternalLinkIcon className="m-chevron" />
      </a>
      <button type="button" onClick={() => void signOut()} className="m-card-link">
        <LogOutIcon className="h-5 w-5 shrink-0" />
        <span className="t-body font-semibold">Log out</span>
        <ChevronRightIcon className="m-chevron" />
      </button>
    </section>
  )
}
