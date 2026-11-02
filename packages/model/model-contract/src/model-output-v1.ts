import type { Outcome } from '@omne-harness/operation-result'
import type { VisibleBlock } from './call-surface.ts'
import type { CallState } from './result.ts'
import type { OutputCursor, Revision } from './root.ts'
import { decodeOutputCursor, decodeRevision } from './identity-values.ts'
import type { ModelStreamDelta, ModelStreamSnapshot } from './model-stream-values.ts'
import { outputBlocks, outputFields, outputRecord } from './model-output-v1-blocks.ts'

export type ModelOutputV1Snapshot = Readonly<{
  projection: 'model-output-v1'
  phase: CallState['phase']
  cursor: OutputCursor
  revision: Revision
  blocks: readonly VisibleBlock[]
}>
export type ModelOutputV1Delta = Omit<ModelOutputV1Snapshot, 'phase'> &
  Readonly<{
    base: Readonly<{ cursor: OutputCursor; revision: Revision }>
    phase?: CallState['phase']
  }>
export type ModelOutputV1 = ModelOutputV1Snapshot | ModelOutputV1Delta
export type ModelOutputV1Failure = Readonly<{ kind: 'invalid-model-output'; reason: string }>

function reject(reason: string): { failure: ModelOutputV1Failure } {
  return { failure: { kind: 'invalid-model-output', reason } }
}

function isPhase(value: unknown): value is CallState['phase'] {
  return (
    value === 'accepted' || value === 'running' || value === 'retry-decision' || value === 'settled'
  )
}

function baseOf(value: unknown): ModelOutputV1Delta['base'] | null {
  if (!outputRecord(value) || !outputFields(value, ['cursor', 'revision'])) return null
  const cursor = decodeOutputCursor(value.cursor)
  const revision = decodeRevision(value.revision)
  return 'failure' in cursor || 'failure' in revision
    ? null
    : { cursor: cursor.ok, revision: revision.ok }
}

function completeProjection(
  value: Record<string, unknown>,
  target: Pick<ModelOutputV1Snapshot, 'cursor' | 'revision' | 'blocks'>,
): Outcome<ModelOutputV1, ModelOutputV1Failure> {
  if (!Object.hasOwn(value, 'base')) {
    if (!isPhase(value.phase)) return reject('phase')
    return { ok: { projection: 'model-output-v1', phase: value.phase, ...target } }
  }
  const base = baseOf(value.base)
  if (base === null) return reject('base')
  const delta = { projection: 'model-output-v1', base, ...target } as const
  if (!Object.hasOwn(value, 'phase')) return { ok: delta }
  if (!isPhase(value.phase)) return reject('phase')
  return { ok: { ...delta, phase: value.phase } }
}

function projection(
  value: unknown,
  encoding: boolean,
): Outcome<ModelOutputV1, ModelOutputV1Failure> {
  if (!outputRecord(value) || value.projection !== 'model-output-v1') return reject('projection')
  const delta = Object.hasOwn(value, 'base')
  if (
    !encoding &&
    !outputFields(
      value,
      delta
        ? ['projection', 'base', 'cursor', 'revision', 'phase', 'blocks']
        : ['projection', 'phase', 'cursor', 'revision', 'blocks'],
    )
  )
    return reject('fields')
  const cursor = decodeOutputCursor(value.cursor)
  const revision = decodeRevision(value.revision)
  if ('failure' in cursor || 'failure' in revision) return reject('identity')
  const blocks = outputBlocks(value.blocks, encoding)
  if (blocks === null) return reject('blocks')
  return completeProjection(value, { cursor: cursor.ok, revision: revision.ok, blocks })
}

function fromInternal(
  value: ModelStreamSnapshot | ModelStreamDelta,
  basePhase: CallState['phase'] | undefined,
): Outcome<ModelOutputV1, ModelOutputV1Failure> {
  if ('value' in value)
    return projection(
      {
        projection: 'model-output-v1',
        phase: value.value.state.phase,
        cursor: value.value.cursor,
        revision: value.value.state.revision,
        blocks: value.value.blocks,
      },
      true,
    )
  if (!isPhase(basePhase)) return reject('base-phase')
  return projection(
    {
      projection: 'model-output-v1',
      base: { cursor: value.from.outputCursor, revision: value.from.revision },
      cursor: value.outputCursor,
      revision: value.state.revision,
      ...(value.state.phase === basePhase ? {} : { phase: value.state.phase }),
      blocks: value.blocks,
    },
    true,
  )
}

export function encodeModelOutputV1(
  input: ModelOutputV1 | ModelStreamSnapshot,
): Outcome<string, ModelOutputV1Failure>
export function encodeModelOutputV1(
  input: ModelStreamDelta,
  basePhase: CallState['phase'],
): Outcome<string, ModelOutputV1Failure>
export function encodeModelOutputV1(
  input: ModelOutputV1 | ModelStreamSnapshot | ModelStreamDelta,
  basePhase?: CallState['phase'],
): Outcome<string, ModelOutputV1Failure> {
  try {
    const result = 'projection' in input ? projection(input, true) : fromInternal(input, basePhase)
    return 'failure' in result ? result : { ok: JSON.stringify(result.ok) }
  } catch {
    return reject('unreadable')
  }
}

/** Decode the display value only: omitted CallState facts cannot be reconstructed. */
export function decodeModelOutputV1(text: unknown): Outcome<ModelOutputV1, ModelOutputV1Failure> {
  if (typeof text !== 'string') return reject('type')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return reject('syntax')
  }
  return projection(value, false)
}
