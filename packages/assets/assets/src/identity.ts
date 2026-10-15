declare const capabilityIdBrand: unique symbol

export type CapabilityId = {
  readonly category: string
  readonly name: string
} & { readonly [capabilityIdBrand]: true }

export type Judgment =
  | { readonly ok: true }
  | { readonly ok: false; readonly rejected: string }

export type JudgeContext = {
  readonly capabilityName?: string
  readonly definition?: string
}

export type Declarations = {
  readonly entries: readonly string[]
}

export type JsonValue =
  | null
  | boolean
  | string
  | number
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type BodyContract = {
  readonly category: string
  readonly schema: JsonValue
  readonly judge: (body: unknown, context?: JudgeContext) => Judgment
  readonly deriveDeclarations: (body: JsonValue, context?: JudgeContext) => Declarations
  readonly references: (body: JsonValue, context?: JudgeContext) => readonly CapabilityId[]
}

export type CategoryRegistry = {
  readonly register: (contract: BodyContract) => void
  readonly lookup: (category: string) => BodyContract | undefined
}

export function capabilityId(
  category: string,
  name: string,
): { readonly ok: true; readonly id: CapabilityId } | { readonly ok: false; readonly rejected: 'incomplete-reference' } {
  if (category === '' || name === '') return { ok: false, rejected: 'incomplete-reference' }
  return { ok: true, id: Object.freeze({ category, name }) as CapabilityId }
}

export function refusal(reason: string): Judgment {
  return Object.freeze({ ok: false, rejected: reason })
}
