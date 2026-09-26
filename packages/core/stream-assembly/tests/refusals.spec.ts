import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { accept } from '../src/index.ts'
import { abandon } from '../src/abandon.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical, eventSources, json, source } from './helpers.ts'

interface RefusalCase {
  readonly id: string
  readonly row: number
  readonly line: number
  readonly stateFixture: string
  readonly operation: string
  readonly expected: string
  readonly oracleConflictReported: boolean
}
const file: { cases: readonly RefusalCase[] } = JSON.parse(
  readFileSync(new URL('./fixtures/refusal-cases.json', import.meta.url), 'utf8'),
)
const model = { kind: 'model_call', callId: 'mc_1', dispatch: 1 }
const tool = { kind: 'tool_execution', callId: 'call_9' }
const visibility = { toHuman: true, toModel: true }
const openText = (index = 0) => ({
  t: 'open',
  index,
  kind: 'text',
  fill: 'append',
  id: 'b_1',
  visibility,
})
const closeText = { t: 'close', index: 0, block: { kind: 'text', id: 'b_1', visibility, text: '' } }
const openImage = {
  t: 'open',
  index: 2,
  kind: 'image',
  fill: 'replace',
  id: 'b_shot',
  visibility: { toHuman: true, toModel: false },
  head: { mediaType: 'image/png' },
}
const image = {
  kind: 'image',
  id: 'b_shot',
  visibility: { toHuman: true, toModel: false },
  mediaType: 'image/png',
  data: { storage: 'attachments', key: 'obj', mediaType: 'image/png' },
}
const accountSource = eventSources('12.', true).find(artifact => artifact.row === '8')
if (accountSource === undefined) throw new Error('account source missing')
const account = json(accountSource.json)

function create(target: unknown): AssemblyState {
  const result = start(target)
  if ('rejected' in result) throw new Error('bad fixture target')
  return result.ok
}
function accepted(state: AssemblyState, event: unknown): AssemblyState {
  const result = accept(state, event)
  if ('rejected' in result) throw new Error(`bad fixture prefix: ${result.rejected}`)
  return result.ok
}
function given(row: RefusalCase): AssemblyState {
  const target = [18, 19, 20, 28].includes(row.row) ? tool : model
  let state = create(target)
  switch (row.stateFixture) {
    case 'none':
    case 'empty':
      return state
    case 'complete-model':
      for (const artifact of eventSources('12.', true)) state = accepted(state, json(artifact.json))
      return state
    case 'open-text-0':
      return accepted(
        state,
        row.row === 28
          ? { ...openText(), visibility: { toHuman: true, toModel: false } }
          : openText(),
      )
    case 'closed-text-0':
      return accepted(accepted(state, openText()), closeText)
    case 'open-text-3':
      return accepted(state, openText(3))
    case 'open-call-0': {
      const opening = eventSources('7a')[0]
      if (opening === undefined) throw new Error('call source missing')
      return accepted(state, json(opening.json))
    }
    case 'reported-account':
      return accepted(state, account)
    case 'open-image-2':
      return accepted(state, openImage)
    case 'closed-image-2':
      return accepted(accepted(state, openImage), { t: 'close', index: 2, block: image })
    case 'open-voice-0':
      return accepted(state, {
        t: 'open',
        index: 0,
        kind: 'voice',
        fill: 'append',
        id: 'voice',
        visibility: { toHuman: true, toModel: false },
        head: { mediaType: 'audio/wav' },
      })
    default:
      throw new Error(`unknown fixture state ${row.stateFixture}`)
  }
}
function input(row: RefusalCase): unknown {
  const candidates = source('5.').filter(artifact => artifact.row === String(row.row))
  for (const artifact of candidates) {
    const parsed = json(artifact.json)
    if (parsed !== null && typeof parsed === 'object' && Object.hasOwn(parsed, 't')) return parsed
    if (row.row === 21) return parsed
  }
  switch (row.row) {
    case 5:
      return openText(1)
    case 26:
      return {
        t: 'open',
        index: 1,
        kind: 'voice',
        fill: 'append',
        id: 'b_2',
        visibility,
        head: { mediaType: 'image/png' },
      }
    case 11:
      return { t: 'fill', index: 0, payload: { ...image, id: 'b_1' } }
    case 15:
    case 19:
      return account
    case 20:
      return { cause: 'upstream_unavailable' }
    default:
      return undefined
  }
}
function observed(row: RefusalCase, state: AssemblyState) {
  switch (row.operation) {
    case 'start':
      return start(input(row))
    case 'closeOut':
      return closeOut(state)
    case 'abandon':
      return abandon(state, row.row === 20 ? input(row) : undefined)
    case 'accept':
      return accept(state, input(row))
    default:
      throw new Error('fixture operation unknown')
  }
}

describe('EX5/S25/S26 all adopted v3 refusals preserve the previous state', () => {
  it('REFUSAL-MATRIX retains all 28 source rows including corrected head-modality priorities', () => {
    expect(file.cases).toHaveLength(28)
    expect(file.cases.some(row => row.oracleConflictReported)).toBe(false)
    expect(file.cases.filter(row => [25, 26].includes(row.row)).map(row => row.expected)).toEqual([
      'head_modality_mismatch',
      'head_modality_mismatch',
    ])
  })
  it.each(file.cases)('$id exact $expected and no old-state change', row => {
    const state = given(row)
    const before = canonical(snapshot(state))
    const settledBefore = canonical(closeOut(state))
    expect(observed(row, state)).toEqual({ rejected: row.expected })
    expect(canonical(snapshot(state))).toEqual(before)
    expect(canonical(closeOut(state))).toEqual(settledBefore)
  })
})
