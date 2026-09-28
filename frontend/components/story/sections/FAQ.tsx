'use client'

import { useId, useState } from 'react'

import { faqs } from '@/components/landing/landing-copy'

/* Objection handling. Static (not an accordion) — six short Q/As read faster
   than they click. Copy lives in landing-copy so edits stay in one file.
   Retargeted for the challenge build: the questions are about what was made and
   whether it can be trusted, not about joining a beta.

   PHONES (< 768px, Placify-pattern revamp phase B2) turn each item into a card-link disclosure:
   the question becomes a kit m-card-link button with a chevron and aria-expanded, and the answer
   shows only when that item is open (story.css hides it by `data-open`). Desktop keeps the static
   list above exactly: it reads the plain question span, the button is m-phone-only, and every
   answer stays in the DOM whatever the phone state. Items open independently. */
export default function FAQ() {
  const baseId = useId()
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set())

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <section id="faq" className="bg-[color:var(--paper-1)] px-6 py-24 md:px-12">
      <div className="mx-auto max-w-3xl">
        <p className="story-eyebrow text-[color:var(--story-teal-ink)]">
          Questions
        </p>
        <h2 className="story-h text-[color:var(--ink-900)]">
          What people ask about this build.
        </h2>

        <dl className="story-faq mt-12 border-t border-[color:var(--paper-line)]">
          {faqs.map((f, i) => {
            const isOpen = open.has(i)
            const answerId = `${baseId}-answer-${i}`
            return (
              <div
                key={f.question}
                className="story-faq__item border-b border-[color:var(--paper-line)] py-7"
                data-open={isOpen ? 'true' : 'false'}
              >
                <dt className="[font-family:var(--font-fraunces),serif] text-[1.15rem] font-semibold text-[color:var(--ink-900)]">
                  <span className="m-desktop-only">{f.question}</span>
                  <button
                    type="button"
                    className="story-faq__toggle m-card-link m-phone-only"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => toggle(i)}
                  >
                    <span className="story-faq__q">{f.question}</span>
                    <svg
                      aria-hidden="true"
                      className="m-chevron story-faq__chevron"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3.5 6 8 10.5 12.5 6" />
                    </svg>
                  </button>
                </dt>
                <dd id={answerId} className="story-faq__a story-sub mt-3 text-[color:var(--ink-600)]">
                  {f.answer}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    </section>
  )
}
