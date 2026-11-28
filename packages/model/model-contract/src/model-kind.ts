/** How a model is called. The kind says nothing about what goes in or comes out: that is the modalities. */
export const MODEL_KINDS = ['llm', 'decisions', 'live'] as const
export type ModelKind = (typeof MODEL_KINDS)[number]

export function isModelKind(value: unknown): value is ModelKind {
  return MODEL_KINDS.some(kind => kind === value)
}

/** What differs between the kinds at the contract; every kind answers each column. */
export type KindTraits = Readonly<{
  /** Whether the caller sends anything while the call runs. */
  input: boolean
  /** The unit a call of this kind is metered in. */
  usage: 'token' | 'second'
}>

export const KIND_TRAITS = {
  llm: { input: false, usage: 'token' },
  decisions: { input: false, usage: 'token' },
  live: { input: true, usage: 'second' },
} as const satisfies Readonly<Record<ModelKind, KindTraits>>
