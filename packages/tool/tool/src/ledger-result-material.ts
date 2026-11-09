// The planned result of a settlement: the channels the model and the program see, kept inline in
// the result record (design 4.1), and the body entry the offloaded original refers to. Only the
// body bytes leave the record; they live in the body store under the ledger's body entry.
import { createHash } from 'node:crypto'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Attachment,
  type ToolOffloadedBody,
  type ToolRenderedResult,
  type Adoption,
  type ToolFailure,
  type ToolResult,
} from '@omne-harness/tool-contract'
import { decodeToolInstant, judgeCommittedToolResult } from '@omne-harness/tool-contract/provider'
import type { ResultPolicy, ToolInstant } from '@omne-harness/tool-contract/provider'
import {
  bodyIdentity,
  bodySource,
  entryBySource,
  sealedManifest,
  type BodyEntryRecord,
  type BodyView,
} from './ledger-body-entries.ts'
import type { BodyWriting, SystemBodyInput } from './ledger-body-writer.ts'
import { planResultBody, type BodyPolicy } from './result-offloading.ts'
import type { ResultReference } from './tools-protocol.ts'

/** The key of the body a settlement writes itself; its identity follows from (no start, key). */
export const SYSTEM_BODY_KEY = 'result'

/** A sealed body entry of this call, as the result descriptor will carry it before its expiry is fixed. */
export type PreparedBody = Readonly<{
  description: Omit<ToolOffloadedBody, 'retention'>
  retentionMs: number
  policy: Adoption
}>
/** The planned channels before the settler fixes the expiry of the referenced body. */
export type PreparedResult = Readonly<{
  value: ToolRenderedResult<ContentBlock>
  body: PreparedBody | null
}>
/** The channels as the result record keeps them: the committed `ToolResult`. */
export type ResultValue = ToolResult<ContentBlock>

/** The descriptor of a sealed entry: its reference, identity, representation and size. */
export function preparedBodyOf(
  entry: BodyEntryRecord,
  previewKind: ToolOffloadedBody['previewKind'],
): Outcome<PreparedBody, ToolFailure> {
  const manifest = sealedManifest(entry)
  if (manifest === null)
    return fail({ kind: 'invalid', field: 'original.source', reason: 'body-not-sealed' })
  return succeed({
    description: {
      source: bodySource(entry.bodyId, manifest),
      bodyId: entry.bodyId,
      representation: entry.representation,
      bodyBytes: String(manifest.bytes),
      previewKind,
    },
    retentionMs: entry.policy.retentionMs,
    policy: entry.policy.adoption,
  })
}

/** The body a final references: a sealed entry of this call (the author's, or the one the ledger wrote), or why not. */
export function authoredBodyOf(
  snapshot: BodyView,
  source: Attachment,
): Outcome<Readonly<{ prepared: PreparedBody; policy: BodyPolicy }>, ToolFailure> {
  const entry = entryBySource(snapshot, source)
  if (entry === null) {
    const opened = [...snapshot.bodies.values()].some(
      body => body.start !== null && body.state.kind === 'opened',
    )
    return fail({
      kind: 'invalid',
      field: 'original.source',
      reason: opened ? 'body-not-sealed' : 'same-call-sealed-body-required',
    })
  }
  const prepared = preparedBodyOf(entry, entry.start === null ? 'mechanical' : 'author-summary')
  return 'failure' in prepared ? prepared : succeed({ prepared: prepared.ok, policy: entry.policy })
}

type PlanningInput<P> = SystemBodyInput<P>

/**
 * Plans the result under its body policy. A rendered result over the threshold becomes a first
 * screen plus a system body the ledger's own writer seals now (model Begin, Put, StoreSeal and
 * LedgerSeal); an authored body keeps its own entry.
 */
export async function prepareResult<P, B extends ContentBlock>(
  input: PlanningInput<P>,
  rendered: ToolRenderedResult<B>,
  policy: BodyPolicy,
  authored: PreparedBody | null,
  target: ResultReference,
  writeBody: BodyWriting<P>['writeBody'],
): Promise<Outcome<PreparedResult, ToolFailure>> {
  const id = bodyIdentity(null, SYSTEM_BODY_KEY)
  const planned = planResultBody(
    rendered,
    policy,
    { ...target, bodyId: id },
    authored?.description ?? null,
  )
  if ('failure' in planned) return planned
  if (planned.ok.kind !== 'body')
    return succeed({
      value: planned.ok.kind === 'author' ? planned.ok.value : rendered,
      body: authored,
    })
  const operation = decodeToolOperationId(
    `result-body:${createHash('sha256').update(input.operation).digest('hex')}`,
  )
  if ('failure' in operation)
    return fail({ kind: 'invalid', field: 'operation', reason: 'body-identity' })
  const systemInput: SystemBodyInput<P> = { ...input, operation: operation.ok }
  const entry = await writeBody(
    systemInput,
    SYSTEM_BODY_KEY,
    planned.ok.frames.map(frame => frame.text).join(''),
    policy,
    planned.ok.representation,
  )
  if ('failure' in entry) return entry
  const prepared = preparedBodyOf(entry.ok, 'mechanical')
  if ('failure' in prepared) return prepared
  if (prepared.ok.description.bodyBytes !== planned.ok.bodyBytes)
    return unavailable('the sealed body size differs from the planned body')
  return succeed({
    value: {
      ...rendered,
      content: planned.ok.content,
      original: {
        kind: 'offloaded',
        source: prepared.ok.description.source,
        summary: planned.ok.summary,
      },
    },
    body: prepared.ok,
  })
}

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'result-value', diagnostic })

/** The record's channels, checked against the policy the reader runs under. */
export function readResultValue<B extends ContentBlock>(
  value: ResultValue,
  policy: ResultPolicy<B>,
): Outcome<ToolResult<B>, ToolFailure> {
  const checked = judgeCommittedToolResult(policy, value)
  return 'failure' in checked ? unavailable('stored result violates its contract') : checked
}

/** The settler fixes the expiry of the referenced body from its own clock (model `Settle`). */
export function activateResult(
  prepared: PreparedResult,
  activatedAt: ToolInstant | null,
): Outcome<ResultValue, ToolFailure> {
  const { value, body } = prepared
  if (value.original.kind === 'none') return succeed({ ...value, original: value.original })
  if (body === null) return unavailable('body preparation is missing')
  if (activatedAt === null) return unavailable('body activation requires a trusted time')
  const expires = Date.parse(activatedAt) + body.retentionMs
  if (!Number.isFinite(expires) || Math.abs(expires) > 8_640_000_000_000_000)
    return fail({ kind: 'invalid', field: 'retention', reason: 'expiry-overflow' })
  const decoded = decodeToolInstant(new Date(expires).toISOString())
  if ('failure' in decoded) return unavailable('body expiry is not a canonical instant')
  return succeed({
    ...value,
    original: {
      kind: 'offloaded',
      summary: value.original.summary,
      ...body.description,
      retention: { adoption: body.policy, activatedAt, expiresAt: decoded.ok },
    },
  })
}
