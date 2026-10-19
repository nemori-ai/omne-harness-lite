import type { Context as CordisContext } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelRegistrationFailure } from './registration.ts'

/** What one directory decided about one registration request. */
export type Admission<Registration, Entered extends { readonly registration: Registration }> =
  | Readonly<{ kind: 'refused'; failure: ModelRegistrationFailure }>
  | Readonly<{ kind: 'recognised'; registration: Registration }>
  | Readonly<{ kind: 'entered'; entry: Entered }>

/**
 * Registers inside an effect of the calling fiber, which both directories do the same way. `admit`
 * runs before this function returns and does not yield, so whatever it asks and records stays
 * consistent in one step. `withdrawal` turns a new entry into the function that ends the
 * registration with the fiber. A refused or recognised request registers nothing, so its effect is
 * removed again at once.
 *
 * `admit` gets `dropEffect`, which removes the effect when the registration ends before its fiber
 * does. Without it, a fiber that registers and releases again and again would collect disposers.
 */
export function registerInCallerFiber<
  Registration,
  Entered extends { readonly registration: Registration },
>(
  ctx: CordisContext,
  admit: (dropEffect: () => void) => Admission<Registration, Entered>,
  withdrawal: (entry: Entered) => () => void,
): Outcome<Registration, ModelRegistrationFailure> {
  const call: {
    admission?: Admission<Registration, Entered>
    remove?: () => unknown
  } = {}
  const dropEffect = () => call.remove?.()
  call.remove = ctx.effect(() => {
    const admission = admit(dropEffect)
    call.admission = admission
    return admission.kind === 'entered' ? withdrawal(admission.entry) : () => undefined
  })
  const { admission } = call
  if (admission === undefined) throw new Error('the registration effect did not run')
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
