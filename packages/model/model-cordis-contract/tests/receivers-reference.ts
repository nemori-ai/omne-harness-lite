// A second, independent implementation of the receiver table, with switchable defects. It exists
// so that the conformance cases can be shown to go red: each defect breaks one rule, and the
// cases that hold that rule must fail. The real table in `src/receivers.ts` is not derived from it.
import type { Context } from '@deepseek-ai/cordis'
import type { ModelResultReceiver } from '@omne-harness/model-contract'
import type { ModelResultReceiverTable } from '../src/cordis.ts'
import { ModelResultReceiverConflictError } from '../src/cordis.ts'

export const DEFECTS = [
  'overwrite-live',
  'refuse-unloading',
  'removal-deletes-successor',
  'sticky-registration',
  'accept-malformed',
] as const
export type Defect = (typeof DEFECTS)[number]

// Cordis fiber states by value: FAILED 3, DISPOSED 4, UNLOADING 5.
const dead = (state: number) => state === 3 || state === 4 || state === 5

type Entry = { owner: string; receiver: ModelResultReceiver<unknown>; ctx: Context }

export function createReferenceTable(defect?: Defect): ModelResultReceiverTable<unknown> {
  const held = new Map<string, Entry>()
  const live = (entry: Entry) =>
    defect === 'sticky-registration' ? true : !dead(entry.ctx.fiber.state)
  return {
    register(ctx, owner, receiver) {
      if (defect !== 'accept-malformed') {
        if (typeof owner !== 'string' || owner === '') throw new TypeError('owner')
        if (typeof receiver?.push !== 'function') throw new TypeError('receiver')
      }
      const old = held.get(owner)
      if (old !== undefined && defect !== 'overwrite-live') {
        const blocks = defect === 'refuse-unloading' ? old.ctx.fiber.state !== 4 : live(old)
        if (blocks) throw new ModelResultReceiverConflictError(owner)
      }
      const entry: Entry = { owner, receiver, ctx }
      held.set(owner, entry)
      const remove = () => {
        if (defect === 'removal-deletes-successor' || held.get(owner) === entry) held.delete(owner)
      }
      if (defect !== 'sticky-registration') {
        // The registration is an effect of the calling fiber, so it ends with that fiber.
        ctx.effect(() => remove, 'reference-receiver')
      }
      return remove
    },
    resolve(owner) {
      const entry = held.get(owner)
      return entry !== undefined && live(entry) ? entry.receiver : null
    },
  }
}
