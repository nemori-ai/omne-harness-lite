export type ScopeRef = Readonly<{
  ref: string & { readonly __scope: unique symbol }
  parent?: ScopeRef
}>
export type ContextBlockKey = `${string}.${string}`
export type ConsumerClass = 'model' | 'tool' | 'extension' | 'coordinator'
export interface ContextBlocks {}

/** The branded text inside a `ScopeRef`; obtained by `decodeScopeRef`, never by assertion. */
export type ScopeText = ScopeRef['ref']

/** The declared value type of a key, `unknown` for a key no semantic owner has declared. */
export type BlockValue<K extends ContextBlockKey> = K extends keyof ContextBlocks
  ? ContextBlocks[K]
  : unknown

/** Count of registration commits applied to one scope; 0 before the first. The holder's durable commit is the authority. */
export type RegistrationRevision = number
/** Per-scope view revision; advances once per projection change (RC-04, RC-07). */
export type ViewRevision = number
/** Per-(scope, key) value revision; advances on publish, invalidate, step commit (RC-07). */
export type BlockRevision = number
/** Producer generation, taken anew by the mechanism at every registration; strictly increasing per key (RC-07). */
export type Generation = number

/** The holder's commit identity for one registration commit or step commit (RC-02). Opaque to this member. */
export type CommitRef = Readonly<{ commit: string }>
/** The producer identity given at registration; independent of generation (RC-07). */
export type ProducerRef = Readonly<{ producer: string }>
/** The holder's step reference; the step commit identity is scope plus step (object model). */
export type StepRef = Readonly<{ step: string }>
/** The identity of the action that proposed a context update (RC-05). */
export type UpdateOriginRef = Readonly<{ origin: string }>
