import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import {
  describedAdoption,
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
  decodeToolMaterialInstant,
  type ResultPolicy,
  type ToolFinalCustody,
  type ToolMaterialSeal,
  type ToolMaterialFingerprint,
  type ToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'
import {
  invalid,
  judgeMutationInput,
  judgeEvidenceField,
  judgeAdoptionField,
  type CallInput,
} from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolLedgerPorts } from './construction.ts'
import { mintEvidence } from './evidence.ts'
import { fixFinalCustodyInput } from './facts-boundary.ts'
import { put, reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { MaterialRecord, MaterialTimeRecord } from './ledger-material-records.ts'
import type { LedgerDomain } from './ledger-store.ts'
import { encodeToolMaterial, type EncodedToolMaterial } from './material-codec.ts'

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'material-custody', diagnostic })
const conflict = (operation: ToolOperationId): Outcome<never, ToolFailure> =>
  fail({ kind: 'conflict', operation })

type Transaction<B extends ContentBlock> = (
  domain: LedgerDomain,
  operation: ToolOperationId,
  decide: (snapshot: Snapshot<B>, mint: Mint) => Promise<Decision<MaterialRecord, B>>,
  unknown: Outcome<MaterialRecord, ToolFailure>,
) => Reply<MaterialRecord>

type Input<P, B extends ContentBlock> = Parameters<ToolFinalCustody<P, B>['preserveFinal']>[0]

async function prepare<P, B extends ContentBlock>(
  snapshot: Snapshot<B>,
  mint: Mint,
  input: Input<P, B>,
  record: MaterialRecord,
  clock: NonNullable<ToolLedgerPorts<P>['materials']>['clock'],
): Promise<Decision<MaterialRecord, B>> {
  const call = snapshot.call
  if (call === null || !sameFactValue(call.start, input.start))
    return reply(invalid('start', 'not-original-invocation'))
  const known = snapshot.materials.get(input.operation)
  if (known !== undefined) {
    if (!sameFactValue(known.input, record.input)) return reply(conflict(input.operation))
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

async function sampleMaterialTime(
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

function fixedInput<P, B extends ContentBlock>(
  supplied: Input<P, B>,
  policy: ResultPolicy<B>,
  adoption: Adoption,
): Outcome<
  Readonly<{ input: Input<P, B>; encoded: EncodedToolMaterial; identity: ToolMaterialFingerprint }>,
  ToolFailure
> {
  const context = judgeMutationInput<P>(supplied, 'write')
  if ('failure' in context) return context
  const fields = fixFinalCustodyInput(supplied, policy, adoption)
  if ('failure' in fields) return fields
  const input = { ...context.ok, ...fields.ok }
  const encoded = encodeToolMaterial(input.final)
  if ('failure' in encoded) return encoded
  const identity = encodeToolMaterial({
    start: input.start,
    source: input.source,
    value: encoded.ok.fingerprint,
  })
  if ('failure' in identity) return identity
  return succeed({ input, encoded: encoded.ok, identity: identity.ok.fingerprint })
}

function materialFor(
  operation: ToolOperationId,
  input: ToolMaterialFingerprint,
  provider: Adoption,
): Outcome<MaterialRecord, ToolFailure> {
  const id = decodeToolMaterialId(`final:${createHash('sha256').update(operation).digest('hex')}`)
  const generation = decodeToolMaterialGeneration('1')
  if ('failure' in id || 'failure' in generation) return invalid('operation', 'material-identity')
  return succeed({
    material: { id: id.ok, generation: generation.ok, provider },
    writeOperation: operation,
    input,
    codec: describedAdoption({
      owner: '@omne-harness/tool',
      name: 'tool-canonical-json-v1',
      revision: '1',
    }),
    state: { kind: 'preparing' },
  })
}

function recordSeal<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  record: MaterialRecord,
  seal: ToolMaterialSeal,
): Decision<MaterialRecord, B> {
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
    return unavailable('material seal does not match the prepared envelope')
  return succeed({
    material: record.material,
    codec: record.codec,
    bytes: value.bytes,
    sha256: value.digest,
    evidence: evidence.ok,
  })
}

export function createLedgerFinalCustody<P, B extends ContentBlock>(
  dependencies: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    policy: ResultPolicy<B>
    adoption: Adoption
    entry(input: unknown, action: 'write'): Reply<CallInput<P>>
    transact: Transaction<B>
  }>,
): ToolFinalCustody<P, B> {
  const { policy, adoption, entry, transact } = dependencies
  const materials = dependencies.materials === undefined ? undefined : { ...dependencies.materials }
  if (materials !== undefined) {
    const provider = judgeAdoptionField(materials.provider, 'materials.provider')
    if ('failure' in provider) throw new TypeError('materials.provider: invalid adoption')
    materials.provider = provider.ok
  }
  const sealMaterial = async (
    input: Input<P, B>,
    record: MaterialRecord,
    encoded: EncodedToolMaterial,
  ): Reply<MaterialRecord> => {
    if (record.state.kind === 'sealed') return succeed(record)
    if (materials === undefined) return unavailable('material provider is not connected')
    const qualified = await entry(input, 'write')
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
    preserveFinal: async supplied => {
      const fixed = fixedInput(supplied, policy, adoption)
      if ('failure' in fixed) return fixed
      const { input, encoded, identity } = fixed.ok
      const allowed = await entry(input, 'write')
      if ('failure' in allowed) return allowed
      if (materials === undefined) return unavailable('material provider is not connected')
      const candidate = materialFor(input.operation, identity, materials.provider)
      if ('failure' in candidate) return candidate
      const record = candidate.ok
      const domain = { kind: 'call', tenant: input.tenant, call: input.call } as const
      const unknown = fail({ kind: 'commit-unknown', operation: input.operation } as const)
      const prepared = await transact(
        domain,
        input.operation,
        (snapshot, mint) => prepare(snapshot, mint, input, record, materials.clock),
        unknown,
      )
      if ('failure' in prepared) return prepared
      const completed = await sealMaterial(input, prepared.ok, encoded)
      if ('failure' in completed) return completed
      const sealed = completed.ok
      if (sealed.state.kind !== 'sealed') return conflict(input.operation)
      const disclosure = await entry(input, 'write')
      if ('failure' in disclosure) return disclosure
      return succeed({
        kind: 'final',
        raw: input.final.raw,
        terminal: input.final.terminal,
        effect: input.final.effect,
        value: encoded.fingerprint,
        envelope: sealed.state.seal,
      })
    },
  }
}

async function preserveBytes<P, B extends ContentBlock>(
  store: NonNullable<ToolLedgerPorts<P>['materials']>['store'],
  input: Input<P, B>,
  record: MaterialRecord,
  encoded: EncodedToolMaterial,
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
