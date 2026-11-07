import { createHash } from 'node:crypto'

import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  DurableEvidence,
  Reply,
  ToolFailure,
  ToolOperationId,
} from '@omne-harness/tool-contract'
import {
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
  decodeToolMaterialInstant,
  type ToolMaterialSeal,
  type ToolMaterialFingerprint,
  type ToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'
import {
  invalid,
  judgeEvidenceField,
  judgeAdoptionField,
  type CallInput,
  type MutationInput,
} from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolLedgerPorts } from './construction.ts'
import { mintEvidence } from './evidence.ts'
import { put, reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { MaterialRecord, MaterialTimeRecord } from './ledger-material-records.ts'
import type { LedgerDomain } from './ledger-store.ts'
import type { MaterialBytes } from './material-codec.ts'

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'material-custody', diagnostic })
const conflict = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
  fail({ kind: 'conflict', operation })

export type MaterialTransaction = (
  domain: LedgerDomain,
  operation: ToolOperationId,
  decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<MaterialRecord>>,
  unknown: Outcome<MaterialRecord, ToolFailure>,
) => Reply<MaterialRecord>

type MaterialInput<P> = MutationInput<P> & Readonly<{ source: DurableEvidence }>
type PreparationCheck = (snapshot: Snapshot) => Outcome<void, ToolFailure>

async function prepare<P>(
  snapshot: Snapshot,
  mint: Mint,
  input: MaterialInput<P>,
  record: MaterialRecord,
  clock: NonNullable<ToolLedgerPorts<P>['materials']>['clock'],
  validate: PreparationCheck,
): Promise<Decision<MaterialRecord>> {
  const allowed = validate(snapshot)
  if ('failure' in allowed) return reply(allowed)
  const known = snapshot.materials.get(input.operation)
  if (known !== undefined) {
    if (
      known.purpose !== record.purpose ||
      !sameFactValue(known.input, record.input) ||
      !sameFactValue(known.codec, record.codec)
    )
      return reply(conflict(input.operation))
    if (known.state.kind === 'deleting' || known.state.kind === 'deleted')
      return reply(conflict(input.operation))
    return reply(succeed(known))
  }
  if (snapshot.operations.has(input.operation)) return reply(conflict(input.operation))
  const checked = await sampleMaterialTime(clock, snapshot.materialTime)
  if ('failure' in checked) return reply(checked)
  const basis = mintEvidence(
    'material-preparation',
    { tenant: input.tenant, call: input.call, operation: input.operation },
    mint.revision,
    record.input,
  )
  return {
    kind: 'commit',
    value: record,
    writes: [
      put({ kind: 'material', material: record }),
      put({ kind: 'material-time', time: { highWatermark: checked.ok } }),
      put({
        kind: 'material-use',
        use: {
          id: `preparation:${input.operation}`,
          kind: 'preparation',
          material: record.material,
          operation: input.operation,
          basis,
        },
      }),
      put({
        kind: 'operation',
        operation: {
          tenant: input.tenant,
          call: input.call,
          operation: input.operation,
          inputDigest: record.input.digest,
          revision: mint.revision,
          receipt: { kind: 'prepare-material', material: record.material, basis },
        },
      }),
    ],
  }
}

export async function sampleMaterialTime(
  clock: NonNullable<ToolLedgerPorts<unknown>['materials']>['clock'],
  previous: MaterialTimeRecord | null,
): Reply<ToolMaterialInstant> {
  let time: Awaited<ReturnType<typeof clock.sample>>
  try {
    time = await clock.sample()
  } catch {
    return unavailable('material clock failed')
  }
  if ('failure' in time) return time
  const checked = decodeToolMaterialInstant(time.ok)
  if ('failure' in checked) return unavailable('material clock returned an invalid instant')
  if (previous !== null && Date.parse(time.ok) < Date.parse(previous.highWatermark))
    return unavailable('material clock is behind the call watermark')
  return checked
}

function materialFor(
  operation: ToolOperationId,
  input: ToolMaterialFingerprint,
  provider: Adoption,
  namespace: MaterialRecord['purpose'],
  codec: Adoption,
): Outcome<MaterialRecord, ToolFailure> {
  const id = decodeToolMaterialId(
    `${namespace}:${createHash('sha256').update(operation).digest('hex')}`,
  )
  const generation = decodeToolMaterialGeneration('1')
  if ('failure' in id || 'failure' in generation) return invalid('operation', 'material-identity')
  return succeed({
    purpose: namespace,
    material: { id: id.ok, generation: generation.ok, provider },
    writeOperation: operation,
    input,
    codec,
    state: { kind: 'preparing' },
  })
}

function recordSeal(
  snapshot: Snapshot,
  record: MaterialRecord,
  seal: ToolMaterialSeal,
): Decision<MaterialRecord> {
  const current = snapshot.materials.get(record.writeOperation)
  if (current === undefined || !sameFactValue(current.input, record.input))
    return reply(conflict(record.writeOperation))
  if (current.state.kind === 'sealed') return reply(succeed(current))
  if (current.state.kind !== 'preparing') return reply(conflict(record.writeOperation))
  const next: MaterialRecord = { ...current, state: { kind: 'sealed', seal } }
  return { kind: 'commit', writes: [put({ kind: 'material', material: next })], value: next }
}

function checkedSeal(
  record: MaterialRecord,
  seal: unknown,
  value: { bytes: string; digest: string },
): Outcome<ToolMaterialSeal, ToolFailure> {
  const fields = fixCleanupFields(seal, ['material', 'codec', 'bytes', 'sha256', 'evidence'])
  if ('failure' in fields) return unavailable('material provider returned an invalid seal')
  const evidence = judgeEvidenceField(fields.ok.evidence, 'seal.evidence')
  if (
    !sameFactValue(fields.ok.material, record.material) ||
    !sameFactValue(fields.ok.codec, record.codec) ||
    fields.ok.bytes !== value.bytes ||
    fields.ok.sha256 !== value.digest ||
    'failure' in evidence
  )
    return unavailable('material seal does not match the prepared material')
  return succeed({
    material: record.material,
    codec: record.codec,
    bytes: value.bytes,
    sha256: value.digest,
    evidence: evidence.ok,
  })
}

export function createLedgerMaterialCustody<P>(
  dependencies: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    entry(input: unknown): Reply<CallInput<P>>
    transact: MaterialTransaction
  }>,
) {
  const { entry, transact } = dependencies
  const materials = dependencies.materials === undefined ? undefined : { ...dependencies.materials }
  if (materials !== undefined) {
    const provider = judgeAdoptionField(materials.provider, 'materials.provider')
    if ('failure' in provider) throw new TypeError('materials.provider: invalid adoption')
    materials.provider = provider.ok
  }
  const sealMaterial = async (
    input: MaterialInput<P>,
    record: MaterialRecord,
    encoded: MaterialBytes,
  ): Reply<MaterialRecord> => {
    if (record.state.kind === 'sealed') return succeed(record)
    if (materials === undefined) return unavailable('material provider is not connected')
    const qualified = await entry(input)
    if ('failure' in qualified) return qualified
    const saved = await preserveBytes(materials.store, input, record, encoded)
    if ('failure' in saved) return saved
    const seal = checkedSeal(record, saved.ok, encoded.fingerprint)
    if ('failure' in seal) return seal
    return transact(
      { kind: 'call', tenant: input.tenant, call: input.call },
      input.operation,
      async snapshot => recordSeal(snapshot, record, seal.ok),
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
  }
  return {
    preserve: async (
      input: MaterialInput<P>,
      encoded: MaterialBytes,
      identity: ToolMaterialFingerprint,
      namespace: MaterialRecord['purpose'],
      validate: PreparationCheck,
    ): Reply<ToolMaterialSeal> => {
      const allowed = await entry(input)
      if ('failure' in allowed) return allowed
      if (materials === undefined) return unavailable('material provider is not connected')
      const candidate = materialFor(
        input.operation,
        identity,
        materials.provider,
        namespace,
        encoded.codec,
      )
      if ('failure' in candidate) return candidate
      const record = candidate.ok
      const domain = { kind: 'call', tenant: input.tenant, call: input.call } as const
      const unknown = fail({ kind: 'commit-unknown', operation: input.operation } as const)
      const prepared = await transact(
        domain,
        input.operation,
        (snapshot, mint) => prepare(snapshot, mint, input, record, materials.clock, validate),
        unknown,
      )
      if ('failure' in prepared) return prepared
      const completed = await sealMaterial(input, prepared.ok, encoded)
      if ('failure' in completed) return completed
      const sealed = completed.ok
      if (sealed.state.kind !== 'sealed') return conflict(input.operation)
      const disclosure = await entry(input)
      return 'failure' in disclosure ? disclosure : succeed(sealed.state.seal)
    },
  }
}

async function preserveBytes<P>(
  store: NonNullable<ToolLedgerPorts<P>['materials']>['store'],
  input: MaterialInput<P>,
  record: MaterialRecord,
  encoded: MaterialBytes,
): Reply<ToolMaterialSeal> {
  const address = {
    principal: input.principal,
    tenant: input.tenant,
    call: input.call,
    operation: input.operation,
    material: record.material,
  }
  let observed: Awaited<ReturnType<typeof store.inspect>>
  try {
    observed = await store.inspect(address)
  } catch {
    return unavailable('material inspection failed')
  }
  if ('failure' in observed) return observed
  const state = fixCleanupFields(observed.ok, ['kind'])
  if ('failure' in state) return unavailable('material inspection returned an invalid state')
  switch (state.ok.kind) {
    case 'excluded':
      return conflict(input.operation)
    case 'sealed': {
      const sealed = fixCleanupFields(observed.ok, ['seal'])
      if ('failure' in sealed) return unavailable('material inspection returned an invalid seal')
      return checkedSeal(record, sealed.ok.seal, encoded.fingerprint)
    }
    case 'unknown':
    case 'pending':
      break
    default:
      return unavailable('material inspection returned an unknown state')
  }
  try {
    return await store.write({
      ...address,
      source: input.source,
      codec: record.codec,
      bytes: encoded.bytes,
    })
  } catch {
    return fail({ kind: 'commit-unknown', operation: input.operation })
  }
}
