import { summarizeModelProvenance, UNKNOWN_MODEL_PROVENANCE } from '../src/model-provenance.ts'
import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'
import { projectModelMessage } from '../src/model-projection.ts'

it('preserves a legal user reference even when its block identity equals a withdrawn reminder block', () => {
  const message = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: 'block_a',
        text: 'I mentioned private A',
        visibility: { toModel: true, toHuman: true },
      },
    ],
  })
  if (!('ok' in message)) throw new Error(JSON.stringify(message))
  expect(projectModelMessage(message.ok, new Set(['block_a']))).toBe(message.ok)
})

it('projects withdrawn reminder text in a new model epoch while preserving original log and legal prefix', async () => {
  const s = await open()
  const message = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'system_reminder',
    blocks: [
      {
        kind: 'text',
        id: 'block_a',
        text: 'private A',
        visibility: { toModel: true, toHuman: true },
      },
      {
        kind: 'text',
        id: 'block_b',
        text: 'legal B',
        visibility: { toModel: true, toHuman: true },
      },
    ],
  })
  if (!('ok' in message)) throw new Error(JSON.stringify(message))
  const snapshot = await s.read()
  succeeded(
    await s.commit({
      kind: 'commitDerived',
      input: {
        ...s.base,
        operation: operationId('reminder'),
        expected: snapshot.revision,
        value: {
          kind: 'context-reminder',
          message: message.ok,
          source: evidence('original'),
          provenance: [
            { owner: 'author', key: 'A', blocks: ['block_a'] },
            { owner: 'author', key: 'B', blocks: ['block_b'] },
          ],
        },
      },
    }),
    'write reminder',
  )
  const before = succeeded(
    await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 100000,
    }),
    'read',
  )
  if (before.kind !== 'page') throw new Error('page required')
  const current = await s.read()
  const command = {
    kind: 'commitDerived' as const,
    input: {
      ...s.base,
      operation: operationId('withdraw-A'),
      expected: current.revision,
      value: {
        kind: 'model-projection' as const,
        epoch: before.basis.epoch,
        blocks: ['block_a'],
        source: evidence('qualification'),
      },
    },
  }
  const receipt = succeeded(await s.commit(command), 'project')
  expect(succeeded(await s.commit(command), 'recover')).toMatchObject({
    ...receipt,
    recovered: true,
  })
  const after = succeeded(
    await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 100000,
    }),
    'read',
  )
  if (after.kind !== 'page') throw new Error('page required')
  expect(after.basis.epoch).not.toBe(before.basis.epoch)
  expect(JSON.stringify(after.rows)).not.toContain('private A')
  expect(JSON.stringify(after.rows)).toContain('legal B')
  expect(after.rows.at(-1)?.provenance).toEqual([
    { owner: 'author', key: 'B', blocks: ['block_b'] },
  ])
  const last = after.rows.at(-1),
    previous = before.rows.at(-1)
  expect(last?.entry).toBe(previous?.entry)
  expect(last?.prefixDigest).not.toBe(previous?.prefixDigest)
  expect(last?.bytes).toBe(Buffer.byteLength(JSON.stringify(last?.message)))
  expect(JSON.stringify(s.port.controls.entriesOf(s.base.tenant, s.base.session))).toContain(
    'private A',
  )
  const window = succeeded(
    await s.port.history.readCompactionContext({ ...s.access, basis: after.basis, coverTo: null }),
    'compaction read',
  )
  expect(JSON.stringify(window)).not.toContain('private A')
  expect(JSON.stringify(window)).toContain('legal B')
  const old = succeeded(
    await s.port.history.readModelView({
      ...s.access,
      basis: before.basis,
      after: null,
      pageBytes: 100000,
    }),
    'stale read',
  )
  expect(old.kind).toBe('epoch-changed')
})

it('mixed summaries retain unique source identities independently of the number of original blocks', () => {
  const one = { owner: 'author', key: 'A', blocks: ['a'] }
  expect(
    summarizeModelProvenance(
      [[one, { ...one, blocks: ['a2'] }], [{ owner: 'author', key: 'B', blocks: ['b'] }]],
      ['summary'],
    ),
  ).toEqual([
    { owner: 'author', key: 'A', blocks: ['summary'] },
    { owner: 'author', key: 'B', blocks: ['summary'] },
  ])
  expect(summarizeModelProvenance([undefined], ['summary'])).toEqual([
    { owner: UNKNOWN_MODEL_PROVENANCE, key: 'unproven-input', blocks: ['summary'] },
  ])
})
