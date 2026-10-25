// The caller-fiber registration helper of SPEC「调用方 fiber 登记辅助」(RFC-0012 item 8). A directory
// Service registers one contribution inside an effect of the calling fiber and withdraws it when
// that fiber unloads. The helper fixes the pairing of admission, effect and outcome; the directory
// keeps the domain decision in `admit`.
import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

/** What a directory decided about one registration request, inside the effect. */
export type Admission<Entry extends { readonly registration: unknown }, Failure> =
  | Readonly<{ kind: 'entered'; entry: Entry }>
  | Readonly<{ kind: 'recognised'; registration: Entry['registration'] }>
  | Readonly<{ kind: 'refused'; failure: Failure }>

/**
 * Registers inside an effect of `ctx`'s fiber. `admit` runs synchronously exactly once when the
 * effect is created; it returns `entered` with the new entry, `recognised` with an existing
 * registration, or `refused`. Only an entered entry keeps the effect: its disposer calls
 * `withdrawal(entry)` once, when the fiber unloads or when `dropEffect` is called. A recognised or
 * refused admission removes the fresh effect again before the function returns.
 *
 * `dropEffect` belongs to this call only. Repeated or re-entrant calls do not withdraw twice. A
 * drop requested inside `admit`, before the remover exists, is recorded and executed once the
 * remover is obtained, still before the function returns.
 *
 * Exceptions are not translated: whatever `ctx.effect` or the explicit remover throws propagates.
 */
export function registerInCallerFiber<Entry extends { readonly registration: unknown }, Failure>(
  ctx: Context,
  admit: (dropEffect: () => void) => Admission<Entry, Failure>,
  withdrawal: (entry: Entry) => void,
): Outcome<Entry['registration'], Failure> {
  const call: {
    admission?: Admission<Entry, Failure>
    remove?: () => unknown
    dropRequested: boolean
    dropped: boolean
  } = { dropRequested: false, dropped: false }
  const dropEffect = (): void => {
    if (call.dropped) return
    if (call.remove === undefined) {
      call.dropRequested = true
      return
    }
    call.dropped = true
    call.remove()
  }
  call.remove = ctx.effect(() => {
    const admission = admit(dropEffect)
    call.admission = admission
    if (admission.kind !== 'entered') return () => undefined
    const { entry } = admission
    return () => {
      withdrawal(entry)
    }
  }, 'registerInCallerFiber')
  const { admission } = call
  if (admission === undefined) {
    // The effect setup did not run synchronously: Cordis 4.0.4 runs a sync setup inline, so this
    // is a programming error or an upstream change, not a refusal.
    call.remove()
    throw new Error('registerInCallerFiber: the registration effect did not run synchronously')
  }
  if (call.dropRequested) dropEffect()
  switch (admission.kind) {
    case 'entered':
      return succeed(admission.entry.registration)
    case 'recognised':
      dropEffect()
      return succeed(admission.registration)
    case 'refused':
      dropEffect()
      return fail(admission.failure)
    default: {
      const unreachable: never = admission
      return unreachable
    }
  }
}
