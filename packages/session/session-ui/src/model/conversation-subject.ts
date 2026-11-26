/** What a jump to the conversation page names: a session, and a run of it to stand at the start of. */
export type ConversationSubject = Readonly<{ session: string; run?: string }>

export function writeConversationSubject({ session, run }: ConversationSubject): string {
  return JSON.stringify(run === undefined ? { session } : { session, run })
}

const named = (value: unknown): value is string => typeof value === 'string' && value !== ''

// Text that is not one of these reads as no subject: the page goes on as it does without one.
export function readConversationSubject(text: string): ConversationSubject | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { session, run } = value as Readonly<Record<string, unknown>>
  if (!named(session)) return null
  if (run === undefined) return { session }
  return named(run) ? { session, run } : null
}
