'use client'

import { TALLY_FEEDBACK_URL } from '@/lib/tally'
import { useSignOut } from '@/lib/shell/sign-out'
import { GROUP_ROW, META, ROW_GROUP, SECTION_TITLE } from '@/lib/shell/ui'
import { ChatIcon, ChevronRightIcon, ExternalLinkIcon, LogOutIcon } from '@/components/dashboard/nav-icons'

/* Feedback and Log out as rows of one grouped card, like the other Settings sections. On a phone
   these are the only way to reach either (the tab bar holds destinations, not actions), so they
   depend on nothing Settings loads: the parent renders them outside its profile/preferences states. */
export default function AccountRows() {
  const signOut = useSignOut()
  return (
    <section aria-labelledby="settings-account" className="flex flex-col gap-3">
      <h2 id="settings-account" className={SECTION_TITLE}>
        Account
      </h2>
      <div className={ROW_GROUP}>
        <a href={TALLY_FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className={GROUP_ROW}>
          <ChatIcon className="h-5 w-5 shrink-0" />
          <span className="flex min-w-0 flex-col py-2.5">
            <span className="font-semibold">Send feedback</span>
            <span className={META}>Opens the form in a new tab</span>
          </span>
          <ExternalLinkIcon className="m-chevron" />
        </a>
        <button type="button" onClick={() => void signOut()} className={GROUP_ROW}>
          <LogOutIcon className="h-5 w-5 shrink-0" />
          <span className="font-semibold">Log out</span>
          <ChevronRightIcon className="m-chevron" />
        </button>
      </div>
    </section>
  )
}
