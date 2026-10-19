// The generated boundary provider of the self-proof. It is a wrapper over the port of
// a double, not a change of the double: the first answer of every method for a new operation is
// replaced by a progress kind of the answer table of the port (or by the lost reply), and so is
// every later read of that operation, until the fixture's handle resolves. The effect of the
// operation has happened at once; only the answer is masked. It uses no control of the double, so
// it can answer a progress kind where the double never would, including for a rejection.
import { fail, succeed } from '@omne-harness/operation-result'
import type { AnswerModel, AnswerRow } from '@omne-harness/tool-contract/testing'

/** The operations that the wrapper has seen, and those whose answers are masked now. */
export interface Mask {
  readonly seen: Set<string>
  readonly masked: Set<string>
  lift(): void
}

export function createMask(): Mask {
  const seen = new Set<string>()
  const masked = new Set<string>()
  return {
    seen,
    masked,
    lift: () => {
      masked.clear()
    },
  }
}

/**
 * How the wrapper treats one method. `key` names the operation that an input asks about (a
 * mutator and the inspection of its operation share a key), `creates` says that a first answer
 * starts a mask, and `answer` builds the masked answer of a progress kind.
 */
export type MaskRule<I> = Readonly<{
  key(input: I): string
  creates: boolean
  answer(kind: string, input: I): unknown
  /**
   * The method opens the mask of a new operation even when its row does not list the kind: the
   * mask that other methods answer under starts at the first answer of the operation, whichever
   * method gives it (the mutators of an external-association port open the mask that
   * `inspectOperation` answers `pending` or `unknown` under).
   */
  opensMask?: boolean
}>

/** The progress answer of a value that has `kind` and a diagnostic text. */
export const progressOf = (kind: string, diagnostic = 'masked'): unknown =>
  succeed({ kind, diagnostic })

/** The lost reply of an operation: the failure that says the answer did not arrive. */
export const lostReplyOf = (kind: string, operation: unknown): unknown => fail({ kind, operation })

/** The kinds that a generated provider masks with: every progress kind and lost reply of the table. */
export function maskKinds(model: AnswerModel): string[] {
  const kinds = new Set<string>()
  for (const row of Object.values(model) as AnswerRow[]) {
    for (const kind of row.progress) kinds.add(kind)
    for (const kind of row.lostReply ?? []) kinds.add(kind)
  }
  return [...kinds]
}

/** The methods of the table whose answers can be progress: the ones a generated provider masks. */
export function maskedMethods(model: AnswerModel): string[] {
  return Object.entries(model)
    .filter(([, row]) => row.progress.length > 0 || (row.lostReply ?? []).length > 0)
    .map(([method]) => method)
}

type Rules<Port> = { readonly [M in keyof Port]?: MaskRule<never> }

/**
 * The port with its methods wrapped by the rules. A method that has no rule is the method of
 * `real`. A method whose row does not list `kind` (neither as progress nor as lost reply) is not
 * masked with it, and it opens the mask of a new operation only when its rule says `opensMask`.
 */
export function maskedPort<Port extends object>(
  real: Port,
  model: AnswerModel,
  rules: Rules<Port>,
  mask: Mask,
  kind: string,
): Port {
  const wrapped: Record<string, unknown> = { ...(real as Record<string, unknown>) }
  for (const [method, rule] of Object.entries(rules) as [string, MaskRule<unknown>][]) {
    const row = (model as Record<string, AnswerRow | undefined>)[method]
    if (row === undefined) throw new Error(`the table has no row for ${method}`)
    const masks = row.progress.includes(kind) || (row.lostReply ?? []).includes(kind)
    const original = (real as Record<string, (input: unknown) => Promise<unknown>>)[method]
    if (original === undefined) throw new Error(`the port has no method ${method}`)
    wrapped[method] = async (input: unknown): Promise<unknown> => {
      if (!masks && rule.opensMask !== true) return original.call(real, input)
      const answer = await original.call(real, input)
      const key = rule.key(input)
      // A failure is the answer of the call, not of the work (or it is already a lost reply of
      // the provider): it is never masked, and it makes the operation known.
      if (typeof answer === 'object' && answer !== null && 'failure' in answer) {
        mask.seen.add(key)
        return answer
      }
      if (rule.creates && !mask.seen.has(key)) {
        mask.seen.add(key)
        mask.masked.add(key)
      }
      return masks && mask.masked.has(key) ? rule.answer(kind, input) : answer
    }
  }
  return wrapped as unknown as Port
}
