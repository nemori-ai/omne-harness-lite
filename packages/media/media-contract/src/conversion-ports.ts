import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { ConverterEngine, EngineEgress, EngineParameters } from './engine.ts'
import type { Provenance } from './values.ts'

/** An engine for one conversion. `withdrawn` aborts when the engine leaves while it is lent. */
export type EngineLease = Readonly<{
  engine: ConverterEngine
  withdrawn: AbortSignal
  release(): void
}>

/** The engines registered now, read at every conversion. No engine of that name now is null. */
export interface Engines {
  borrow(name: string): EngineLease | null
}

export type DefinitionAnswer =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'resolved'
      definition: Provenance
      engine: string
      parameters: EngineParameters
      egress: EngineEgress
    }>

/** Which converter definition is in force for a tenant and a kind of medium, now. */
export interface ConverterDefinitions {
  resolve(input: {
    tenant: TenantId
    mediaType: string
  }): Promise<Outcome<DefinitionAnswer, Readonly<{ kind: 'unavailable'; diagnostic: string }>>>
}

export interface MediaTimer {
  /** Calls `fire` once after the delay; the answer cancels it. */
  after(delayMs: number, fire: () => void): () => void
}
