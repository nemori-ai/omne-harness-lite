import { fail, succeed } from '@omne-harness/operation-result'
import type { AnswerModel, AnswerRow } from '@omne-harness/tool-contract/testing'

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

export type MaskRule<I> = Readonly<{
  key(input: I): string
  creates: boolean
  answer(kind: string, input: I): unknown
  opensMask?: boolean
}>

export const progressOf = (kind: string, diagnostic = 'masked'): unknown =>
  succeed({ kind, diagnostic })

export const lostReplyOf = (kind: string, operation: unknown): unknown => fail({ kind, operation })

export function maskKinds(model: AnswerModel): string[] {
  const kinds = new Set<string>()
  for (const row of Object.values(model) as AnswerRow[]) {
    for (const kind of row.progress) kinds.add(kind)
    for (const kind of row.lostReply ?? []) kinds.add(kind)
  }
  return [...kinds]
}

export function maskedMethods(model: AnswerModel): string[] {
  return Object.entries(model)
    .filter(([, row]) => row.progress.length > 0 || (row.lostReply ?? []).length > 0)
    .map(([method]) => method)
}

type Rules<Port> = { readonly [M in keyof Port]?: MaskRule<never> }

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
