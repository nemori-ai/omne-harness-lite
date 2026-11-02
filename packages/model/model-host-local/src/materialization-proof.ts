import { tenantCodec } from '@omne-harness/legal-identity'
import {
  describeModelMaterialization,
  type ModelCommandsEvidence,
} from '@omne-harness/model/commands'
import type { ModelFailure, TransportFailure } from '@omne-harness/model-contract'
import type { ActorRef, ExecutionRef, SendDemand } from '@omne-harness/model-contract/provider'

export type MaterializationProofInput = Parameters<ModelCommandsEvidence['materialization']>[0]
export interface ModelMaterializationEvidenceReader {
  prove(input: MaterializationProofInput): ReturnType<ModelCommandsEvidence['materialization']>
}
export type PiMaterializationOptions = Readonly<{
  maxRecords: number
  execution(input: ExecutionRef): { ok: ActorRef } | { failure: ModelFailure }
}>

export const SOURCE_UNAVAILABLE = Object.freeze({
  kind: 'unavailable',
  dependency: 'model-materialization',
  diagnostic: 'source-unavailable',
} satisfies TransportFailure)
const BINDING = Object.freeze({
  kind: 'invalid',
  field: 'receipt',
  reason: 'binding',
} satisfies TransportFailure)
type Description = ReturnType<typeof describeModelMaterialization>
type ProvenMaterialization = Readonly<{
  owner: object
  demand: SendDemand<unknown>
  receipt: MaterializationProofInput['receipt']
  description: Description
}>

function key(
  input: Pick<MaterializationProofInput, 'tenant' | 'call' | 'dispatch' | 'execution'>,
): string | null {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok || input.execution === null) return null
  const executionTenant = tenantCodec.encode(input.execution.tenant)
  if (
    !executionTenant.ok ||
    tenant.value !== executionTenant.value ||
    input.call !== input.execution.call
  )
    return null
  return JSON.stringify([
    tenant.value,
    input.call,
    input.execution.instance,
    input.execution.generation,
    input.dispatch,
  ])
}

/** Kept inside the resource factory. Only its reader is exposed to consumers. */
export function materializationRecords(options: PiMaterializationOptions) {
  if (
    !options ||
    !Number.isSafeInteger(options.maxRecords) ||
    options.maxRecords <= 0 ||
    typeof options.execution !== 'function'
  )
    throw new RangeError('materialization requires a positive maxRecords and execution authority')
  const records = new Map<string, ProvenMaterialization>()
  const reservations = new Set<object>()
  const reader: ModelMaterializationEvidenceReader = Object.freeze({
    prove(input: MaterializationProofInput) {
      if (input.execution === null) return { failure: SOURCE_UNAVAILABLE }
      const qualification = options.execution(input.execution)
      if ('failure' in qualification) return qualification
      const id = key(input)
      const record = id === null ? undefined : records.get(id)
      if (record === undefined) return { failure: SOURCE_UNAVAILABLE }
      try {
        const actual = describeModelMaterialization({
          ...input,
          execution: input.execution,
          dispatch: record.demand.dispatch,
          initiator: record.demand.initiator,
        })
        if (actual.source.digest !== record.description.source.digest) return { failure: BINDING }
        return { ok: structuredClone(record.description.source) }
      } catch {
        return { failure: BINDING }
      }
    },
  })
  return {
    reader,
    reserve(owner: object, demand: SendDemand<unknown>): ModelFailure | null {
      if (key(demand) === null) return BINDING
      if (reservations.size >= options.maxRecords)
        return {
          kind: 'unavailable',
          dependency: 'model-materialization',
          diagnostic: 'record-capacity',
        }
      reservations.add(owner)
      return null
    },
    record(
      owner: object,
      demand: SendDemand<unknown>,
      receipt: MaterializationProofInput['receipt'],
    ): TransportFailure | null {
      const id = key(demand)
      if (id === null || !reservations.has(owner)) return SOURCE_UNAVAILABLE
      const previous = records.get(id)
      if (previous !== undefined && previous.owner !== owner) return BINDING
      try {
        const capturedReceipt = structuredClone(receipt)
        const description = describeModelMaterialization({
          ...demand,
          receipt: capturedReceipt,
        })
        if (Buffer.byteLength(JSON.stringify(description.source), 'utf8') > 4096)
          return SOURCE_UNAVAILABLE
        records.set(id, {
          owner,
          demand,
          receipt: capturedReceipt,
          description: structuredClone(description),
        })
        return null
      } catch {
        return SOURCE_UNAVAILABLE
      }
    },
    release(owner: object, demand: SendDemand<unknown>): void {
      const id = key(demand)
      if (id !== null && records.get(id)?.owner === owner) records.delete(id)
      reservations.delete(owner)
    },
  }
}
