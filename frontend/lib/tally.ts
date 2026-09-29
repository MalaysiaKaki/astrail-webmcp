// Tally form IDs, kept in one place and deliberately separate so the two lists never
// get conflated — they carry different consent/purpose (launch legal precautions A3).
//
//   NOTIFY  — "email me when the full launch / hotel booking is ready" (public landing)
//   FEEDBACK — in-app beta feedback ("tell us what broke"), from the sidebar and Settings
//
// Feedback opens the hosted form in a new browser tab (TALLY_FEEDBACK_URL), not a popup: the
// popup stacked over pages and followed client-side navigation. Nothing in /app needs the Tally
// popup loader any more; the classic landing's WaitlistFormEmbed loads its own embed script.
export const TALLY_NOTIFY_FORM_ID = 'QKjrvk'
export const TALLY_FEEDBACK_FORM_ID = 'PdNreP'
export const TALLY_FEEDBACK_URL = `https://tally.so/r/${TALLY_FEEDBACK_FORM_ID}`
