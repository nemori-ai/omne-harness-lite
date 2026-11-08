import type { JsonLimits } from '@omne-harness/json-text'
import { judgeContentBlock, type TextContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  Reply,
  ToolFailure,
  ToolOperationId,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  type SealedToolBody,
  type ToolBodyCustody,
  type ToolMaterialSeal,
} from '@omne-harness/tool-contract/provider'
import {
  invalid,
  judgeEvidenceField,
  judgeMutationInput,
  type CallInput,
  type MutationInput,
} from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolLedgerPorts, ToolOffloadingConfiguration } from './construction.ts'
import { digestOf } from './evidence.ts'
import type { Decision, Mint, Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import { materialContent } from './ledger-material-content.ts'
import { createLedgerMaterialCustody, type MaterialTransaction } from './ledger-material-custody.ts'
import type { LedgerDomain } from './ledger-store.ts'
import {
  encodeToolMaterial,
  type EncodedToolMaterial,
  type MaterialBytes,
} from './material-codec.ts'
import { resultBodyPolicy, type BodyPolicy } from './result-offloading.ts'
import { encodeTextBody } from './text-body-codec.ts'

export type BodyPreparationRecord = Readonly<{
  operation: ToolOperationId
  start: ToolStartRecord
  source: DurableEvidence
  inputDigest: string
  bodyBytes: string
  policy: BodyPolicy
  state: Readonly<{ kind: 'preparing' }> | Readonly<{ kind: 'sealed'; seal: ToolMaterialSeal }>
}>

type BodyTransaction = <T>(
  domain: LedgerDomain,
  operation: ToolOperationId,
  decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<T>>,
  unknown: Outcome<T, ToolFailure>,
) => Reply<T>

export function bodyOf(record: BodyPreparationRecord): Outcome<SealedToolBody, ToolFailure> {
  if (record.state.kind !== 'sealed' || record.policy.declaration.kind !== 'text')
    return invalid('body', 'sealed-body-required')
  const id = decodeToolBodyId(
    `body:${digestOf({ operation: record.operation, start: record.start })}`,
  )
  if ('failure' in id) return invalid('bodyId', 'invalid-body-identity')
  return succeed({
    source: materialContent(record.state.seal),
    bodyId: id.ok,
    representation: record.policy.declaration,
    bodyBytes: record.bodyBytes,
    custody: record.state.seal.evidence,
  })
}

function textFrames(value: unknown): Outcome<readonly TextContentBlock[], ToolFailure> {
  if (!Array.isArray(value)) return invalid('frames', 'array-required')
  const frames: TextContentBlock[] = []
  for (const candidate of value) {
    const checked = judgeContentBlock(candidate)
    if ('rejected' in checked || checked.ok.kind !== 'text' || !checked.ok.visibility.toModel)
      return invalid('frames', 'model-text-required')
    if (!checked.ok.text.isWellFormed()) return invalid('frames', 'invalid-unicode-text')
    frames.push(checked.ok)
  }
  return succeed(frames)
}

function invocation(snapshot: Snapshot, start: unknown): Outcome<void, ToolFailure> {
  if (
    snapshot.call?.start === undefined ||
    snapshot.call.start === null ||
    !sameFactValue(snapshot.call.start, start)
  )
    return invalid('start', 'not-original-invocation')
  return succeed(undefined)
}

type BodyInput<P> = MutationInput<P> &
  Readonly<{
    source: DurableEvidence
    start: unknown
    encoded: MaterialBytes
    fingerprint: EncodedToolMaterial['fingerprint']
    bodyBytes: string
  }>

function fixedInput<P>(supplied: unknown): Outcome<BodyInput<P>, ToolFailure> {
  const context = judgeMutationInput<P>(supplied, 'write')
  if ('failure' in context) return context
  const fields = fixCleanupFields(supplied, ['start', 'source', 'frames'])
  if ('failure' in fields) return fields
  const source = judgeEvidenceField(fields.ok.source, 'source')
  if ('failure' in source) return source
  const frames = textFrames(fields.ok.frames)
  if ('failure' in frames) return frames
  const encoded = encodeToolMaterial(frames.ok)
  if ('failure' in encoded) return encoded
  const fingerprint = encodeToolMaterial({
    start: fields.ok.start,
    source: source.ok,
    value: encoded.ok.fingerprint,
  })
  if ('failure' in fingerprint) return fingerprint
  const bytes = frames.ok.reduce(
    (size, frame) => size + BigInt(Buffer.byteLength(frame.text, 'utf8')),
    0n,
  )
  return succeed({
    ...context.ok,
    source: source.ok,
    start: fields.ok.start,
    encoded: encodeTextBody(frames.ok),
    fingerprint: fingerprint.ok.fingerprint,
    bodyBytes: String(bytes),
  })
}

function prepareBody<P>(
  snapshot: Snapshot,
  input: BodyInput<P>,
  configuration: ToolOffloadingConfiguration,
  readResultArguments: JsonLimits,
): Decision<BodyPreparationRecord> {
  const known = snapshot.bodyPreparations.get(input.operation)
  if (known !== undefined)
    return {
      kind: 'reply',
      outcome:
        known.inputDigest === input.fingerprint.digest
          ? succeed(known)
          : fail({ kind: 'conflict', operation: input.operation }),
    }
  const call = snapshot.call
  if (
    call === null ||
    call.start === null ||
    (call.state.phase !== 'starting' && call.state.phase !== 'running')
  )
    return { kind: 'reply', outcome: invalid('call', 'not-running') }
  const policy = resultBodyPolicy(call.request, configuration, readResultArguments)
  if ('failure' in policy) return { kind: 'reply', outcome: policy }
  if (policy.ok.declaration.kind !== 'text')
    return {
      kind: 'reply',
      outcome: fail({
        kind: 'unsupported',
        adoption: policy.ok.adoption,
        reason: 'text body declaration required',
      }),
    }
  if (BigInt(input.bodyBytes) > BigInt(policy.ok.maxBodyBytes))
    return { kind: 'reply', outcome: invalid('frames', 'body-too-large') }
  const record: BodyPreparationRecord = {
    operation: input.operation,
    start: call.start,
    source: input.source,
    inputDigest: input.fingerprint.digest,
    bodyBytes: input.bodyBytes,
    policy: policy.ok,
    state: { kind: 'preparing' },
  }
  return {
    kind: 'commit',
    value: record,
    writes: [{ kind: 'put', record: { kind: 'body-preparation', body: record } }],
  }
}

function sealBody(
  snapshot: Snapshot,
  intent: BodyPreparationRecord,
  seal: ToolMaterialSeal,
): Decision<BodyPreparationRecord> {
  const known = snapshot.bodyPreparations.get(intent.operation)
  if (known === undefined || known.inputDigest !== intent.inputDigest)
    return { kind: 'reply', outcome: fail({ kind: 'conflict', operation: intent.operation }) }
  if (known.state.kind === 'sealed')
    return {
      kind: 'reply',
      outcome: sameFactValue(known.state.seal, seal)
        ? succeed(known)
        : fail({ kind: 'conflict', operation: intent.operation }),
    }
  const record: BodyPreparationRecord = { ...known, state: { kind: 'sealed', seal } }
  return {
    kind: 'commit',
    value: record,
    writes: [{ kind: 'put', record: { kind: 'body-preparation', body: record } }],
  }
}

export function createLedgerBodyCustody<P>(
  ports: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    configuration: ToolOffloadingConfiguration
    readResultArguments: JsonLimits
    entry(input: unknown, action: 'write'): Reply<CallInput<P>>
    load(input: CallInput<P>): Reply<Snapshot>
    transact: BodyTransaction & MaterialTransaction
  }>,
): ToolBodyCustody<P> {
  const custody = createLedgerMaterialCustody({
    materials: ports.materials,
    transact: ports.transact,
    entry: input => ports.entry(input, 'write'),
  })
  const check = async (input: MutationInput<P>, snapshot: Snapshot, start: unknown) => {
    const authorized = await ports.entry(input, 'write')
    return 'failure' in authorized ? authorized : invocation(snapshot, start)
  }
  return {
    preserve: async supplied => {
      const fixed = fixedInput<P>(supplied)
      if ('failure' in fixed) return fixed
      const input = fixed.ok
      const allowed = await ports.entry(input, 'write')
      if ('failure' in allowed) return allowed
      const domain = { kind: 'call', tenant: input.tenant, call: input.call } as const
      const unknown = fail({ kind: 'commit-unknown', operation: input.operation } as const)
      const intent = await ports.transact<BodyPreparationRecord>(
        domain,
        input.operation,
        async snapshot => {
          const allowed = await check(input, snapshot, input.start)
          return 'failure' in allowed
            ? { kind: 'reply', outcome: allowed }
            : prepareBody(snapshot, input, ports.configuration, ports.readResultArguments)
        },
        unknown,
      )
      if ('failure' in intent) return intent
      if (intent.ok.state.kind === 'sealed') return bodyOf(intent.ok)
      const sealed = await custody.preserve(
        input,
        input.encoded,
        input.fingerprint,
        'body',
        snapshot => {
          const original = invocation(snapshot, input.start)
          if ('failure' in original) return original
          const known = snapshot.bodyPreparations.get(input.operation)
          return known?.inputDigest === intent.ok.inputDigest
            ? succeed(undefined)
            : invalid('body', 'original-preparation-required')
        },
      )
      if ('failure' in sealed) return sealed
      const saved = await ports.transact<BodyPreparationRecord>(
        domain,
        input.operation,
        async snapshot => {
          const allowed = await check(input, snapshot, input.start)
          return 'failure' in allowed
            ? { kind: 'reply', outcome: allowed }
            : sealBody(snapshot, intent.ok, sealed.ok)
        },
        unknown,
      )
      return 'failure' in saved ? saved : bodyOf(saved.ok)
    },
    inspect: async supplied => {
      const input = judgeMutationInput<P>(supplied, 'write')
      if ('failure' in input) return input
      const fields = fixCleanupFields(supplied, ['start'])
      if ('failure' in fields) return fields
      const allowed = await ports.entry(input.ok, 'write')
      if ('failure' in allowed) return allowed
      const snapshot = await ports.load(input.ok)
      if ('failure' in snapshot) return snapshot
      const current = await check(input.ok, snapshot.ok, fields.ok.start)
      if ('failure' in current) return current
      const record = snapshot.ok.bodyPreparations.get(input.ok.operation)
      if (record === undefined) return succeed({ kind: 'unknown' })
      if (record.state.kind === 'preparing') return succeed({ kind: 'preparing' })
      const body = bodyOf(record)
      return 'failure' in body ? body : succeed({ kind: 'sealed', body: body.ok })
    },
  }
}
