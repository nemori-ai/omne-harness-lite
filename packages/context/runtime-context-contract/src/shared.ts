export type ScopeRef = Readonly<{
  ref: string & { readonly __scope: unique symbol }
  parent?: ScopeRef
}>
export type ContextBlockKey = `${string}.${string}`
export type ConsumerClass = 'model' | 'tool' | 'extension' | 'coordinator'
export interface ContextBlocks {}

export type ScopeText = ScopeRef['ref']

export type BlockValue<K extends ContextBlockKey> = K extends keyof ContextBlocks
  ? ContextBlocks[K]
  : unknown

export type RegistrationRevision = number
export type ViewRevision = number
export type BlockRevision = number
export type Generation = number

export type CommitRef = Readonly<{ commit: string }>
export type ProducerRef = Readonly<{ producer: string }>
export type StepRef = Readonly<{ step: string }>
export type UpdateOriginRef = Readonly<{ origin: string }>
