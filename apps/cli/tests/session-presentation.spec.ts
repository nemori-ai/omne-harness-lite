import { checkSession } from '@omne-harness-lite/session-log'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { expect, it } from 'vitest'
import { createSessionPresentation, type ModelSnapshot } from '../src/session-presentation.ts'
import type { ToolObservation } from '../src/session-human-content.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import type { ModelExecutionRef } from '@omne-harness-lite/model-request-runtime'

const binding = checkedTenantBinding({
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'org', account: 'account' },
})
const session = checkSession('session')
if ('failure' in session) throw Error('session')
const block = parseOpaqueIdentifier('text', 'BlockId')
if (!('ok' in block)) throw Error('block')
const blockId = block.ok
const scope = { tenant: binding.tenant, session: session.ok }
const ref: ModelExecutionRef = { ...scope, callId: 'call', dispatch: 0 }
const policy = { maxCalls: 2, maxBlocks: 4, maxCharactersPerCall: 100 }
function snapshot(text: string, toHuman = true): ModelSnapshot {
  return {
    position: 1,
    blocks: [
      {
        index: 0,
        closed: false,
        opened: {
          id: blockId,
          kind: 'text',
          fill: 'append',
          visibility: { toHuman, toModel: true },
        },
        content: text,
      },
    ],
  }
}
it('shows only public blocks from the original tenant, Session and Run, replacing cumulative snapshots', async () => {
  const live = createSessionPresentation(policy)
  live.bindModel(scope, 'run', ref.callId)
  live.model(ref, snapshot('a'))
  expect((await live.read(scope, 'run')).items).toEqual([{ id: blockId, kind: 'text', text: 'a' }])
  live.model(ref, snapshot('ab'))
  expect((await live.read(scope, 'run')).items).toEqual([{ id: blockId, kind: 'text', text: 'ab' }])
  expect((await live.read(scope, 'other-run')).items).toEqual([])
  const foreign = checkedTenantBinding({
    ...binding,
    tenant: { organization: 'other', account: 'account' },
  })
  expect((await live.read({ ...scope, tenant: foreign.tenant }, 'run')).items).toEqual([])
  live.model(ref, snapshot('private', false))
  expect((await live.read(scope, 'run')).items).toEqual([])
})
it('limits retained content and drops transient data on close', async () => {
  const live = createSessionPresentation(policy)
  live.bindModel(scope, 'run', ref.callId)
  live.model(ref, snapshot('x'.repeat(101)))
  expect(await live.read(scope, 'run')).toMatchObject({ omitted: true })
  live.close()
  live.model(ref, snapshot('late'))
  expect((await live.read(scope, 'run')).items).toEqual([])
})
it('does not accept unknown physical calls or superseded dispatch snapshots', async () => {
  const live = createSessionPresentation(policy)
  live.model(ref, snapshot('unknown'))
  expect((await live.read(scope, 'run')).items).toEqual([])
  live.bindModel(scope, 'run', ref.callId)
  live.model({ ...ref, dispatch: 1 }, snapshot('new'))
  live.model(ref, snapshot('old'))
  expect((await live.read(scope, 'run')).items).toEqual([
    { id: blockId, kind: 'text', text: 'new' },
  ])
})
it('keeps public reasoning distinct and rejects an older assembly position', async () => {
  const live = createSessionPresentation(policy)
  live.bindModel(scope, 'run', ref.callId)
  live.model(ref, {
    position: 2,
    blocks: [
      {
        index: 0,
        closed: true,
        block: {
          id: blockId,
          kind: 'thinking',
          text: 'public summary',
          visibility: { toHuman: true, toModel: true },
        },
      },
    ],
  })
  live.model(ref, snapshot('old'))
  expect((await live.read(scope, 'run')).items).toEqual([
    { id: blockId, kind: 'thinking', text: 'public summary' },
  ])
})
it('observes actual tool state only for its original scope and Run, in call order', async () => {
  const live = createSessionPresentation({ ...policy, maxCalls: 4 })
  let state = 'running',
    reads = 0
  live.bindModel(scope, 'run', 'first')
  live.model({ ...ref, callId: 'first' }, snapshot('before'))
  live.bindTool({
    scope,
    run: 'run',
    call: 'tool-call',
    block: {
      id: 'tool-block',
      kind: 'tool_call',
      tool: 'Shell',
      call: 'tool-call',
      arguments: { encoding: 'json', text: '{}' },
      observation: null,
    },
    read: async () => {
      reads++
      return { terminal: false, observation: { state, blocks: [], notice: null, offloaded: false } }
    },
  })
  live.bindModel(scope, 'run', 'last')
  live.model({ ...ref, callId: 'last' }, snapshot('after'))
  expect((await live.read(scope, 'other')).items).toEqual([])
  expect(reads).toBe(0)
  expect((await live.read(scope, 'run')).items).toEqual([
    { id: blockId, kind: 'text', text: 'before' },
    {
      id: 'tool-block',
      kind: 'tool_call',
      tool: 'Shell',
      call: 'tool-call',
      arguments: { encoding: 'json', text: '{}' },
      observation: { state: 'running', blocks: [], notice: null, offloaded: false },
    },
    { id: blockId, kind: 'text', text: 'after' },
  ])
  state = 'completed'
  expect((await live.read(scope, 'run')).items[1]).toMatchObject({
    observation: { state: 'completed' },
  })
})
it('bounds aggregate response text and does not return tool data after close during a read', async () => {
  const live = createSessionPresentation(policy)
  for (const call of ['a', 'b']) {
    live.bindModel(scope, 'run', call)
    live.model({ ...ref, callId: call }, snapshot('a'.repeat(80)))
  }
  const value = await live.read(scope, 'run')
  expect(
    value.items.flatMap(item => (item.kind === 'text' ? item.text : [])).join(''),
  ).toHaveLength(92)
  expect(value.omitted).toBe(true)
  const gate = Promise.withResolvers<{ terminal: boolean; observation: ToolObservation }>()
  live.bindTool({
    scope,
    run: 'run',
    call: 'tool',
    block: {
      id: 'tool',
      kind: 'tool_call',
      call: 'tool',
      tool: 'Shell',
      arguments: { encoding: 'json', text: '{}' },
      observation: null,
    },
    read: () => gate.promise,
  })
  const pending = live.read(scope, 'run')
  live.close()
  gate.resolve({
    terminal: true,
    observation: { state: 'completed', blocks: [], notice: null, offloaded: false },
  })
  expect((await pending).items).toEqual([])
})

it('copies only public display fields and does not retain the source snapshot', async () => {
  const live = createSessionPresentation(policy)
  live.bindModel(scope, 'run', ref.callId)
  const mutable = {
    position: 1,
    blocks: [
      {
        index: 0,
        closed: true as const,
        block: {
          id: blockId,
          kind: 'thinking' as const,
          text: 'visible',
          visibility: { toHuman: true, toModel: true },
        },
      },
    ],
  }
  live.model(ref, mutable)
  mutable.blocks[0]!.block.text = 'changed after observation'
  mutable.blocks[0]!.block.visibility.toHuman = false
  expect((await live.read(scope, 'run')).items).toEqual([
    { id: blockId, kind: 'thinking', text: 'visible' },
  ])
})
