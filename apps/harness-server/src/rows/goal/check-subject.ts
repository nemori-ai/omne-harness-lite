const PRINCIPALS = new WeakMap<object, unknown>()

/** The caller of goals that is the check of a session's work: only the assembly makes one, around the work principal. */
export function checkSubject(principal: unknown): object {
  const subject = Object.freeze({ check: 'goal-check' })
  PRINCIPALS.set(subject, principal)
  return subject
}

/** The work principal a check subject was made around; undefined for any other subject. */
export function checkedPrincipal(subject: unknown): unknown {
  return typeof subject === 'object' && subject !== null ? PRINCIPALS.get(subject) : undefined
}
