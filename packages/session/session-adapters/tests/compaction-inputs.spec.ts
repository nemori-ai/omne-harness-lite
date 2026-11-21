import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import {
  decodeActionId,
  decodeAgentExecutionId,
  compactionInputText,
} from '@omne-harness/agent-contract'
import { sampleCompactionInput } from '@omne-harness/agent-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeModelCallId } from '@omne-harness/model-contract'
import {
  createSessionCompactionInputs,
  type CompactionInputBytes,
} from '../src/compaction-inputs.ts'

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const parsed = tenantCodec.parse(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}',
)
if (!parsed.ok) throw new Error('invalid tenant fixture')
const access = { principal: 'alice', tenant: parsed.value }
const execution = ok(decodeAgentExecutionId('execution'))
const preparation = ok(decodeActionId('preparation'))
const digest = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
function fixture() {
  const blobs = new Map<string, string>()
  const roots = new Map<string, string>()
  const reads: (string | null)[] = []
  const bytes: CompactionInputBytes<string> = {
    publish: async input => {
      for (const blob of input.blobs) {
        expect(digest(blob.payload)).toBe(blob.digest)
        blobs.set(blob.digest, blob.payload)
      }
      const record = `session/${input.execution}/${input.preparation}/${input.manifest}`
      roots.set(record, input.manifest)
      return succeed({ owner: 'test', record, revision: '1', digest: input.manifest })
    },
    open: async input => {
      reads.push(null)
      const root = roots.get(input.source.record)
      if (root === undefined) return fail({ kind: 'denied', action: 'read' })
      const manifest = blobs.get(root)
      if (manifest === undefined)
        return fail({ kind: 'unavailable', owner: 'bytes', diagnostic: 'missing' })
      return succeed({
        manifest,
        read: async digest => {
          reads.push(digest)
          const text = blobs.get(digest)
          return text === undefined
            ? fail({ kind: 'unavailable' as const, owner: 'bytes', diagnostic: 'missing' })
            : succeed(text)
        },
      })
    },
  }
  const { outputMessageId: _allocatedByHolder, ...value } = sampleCompactionInput()
  return { blobs, roots, reads, bytes, input: { ...access, execution, preparation, value } }
}

it('stores a reference manifest and unique message bodies, then reads through a fresh instance', async () => {
  const f = fixture()
  const ref = ok(await createSessionCompactionInputs(f.bytes).freeze(f.input))
  const manifest = f.blobs.get(f.roots.get(ref.source.record) ?? '')
  expect(manifest).toBeDefined()
  expect(manifest).not.toContain('Keep the unfinished work.')
  expect(f.blobs.size).toBe(3)
  const read = ok(await createSessionCompactionInputs(f.bytes).read({ ...access, reference: ref }))
  expect(read.history).toEqual(f.input.value.history)
  expect(read.frame).toEqual(f.input.value.frame)
  expect(read.target).toEqual(f.input.value.target)
  expect(digest(compactionInputText(read))).toBe(ref.digest)
  expect(f.reads).toHaveLength(3)
  const same = ok(await createSessionCompactionInputs(f.bytes).freeze(f.input))
  expect(same).toEqual(ref)
  expect(f.blobs.size).toBe(3)
})

it('refuses missing or changed content without reconstructing it from current history', async () => {
  const f = fixture()
  const store = createSessionCompactionInputs(f.bytes)
  const ref = ok(await store.freeze(f.input))
  const body = [...f.blobs.keys()].find(key => key !== f.roots.get(ref.source.record))
  if (body === undefined) throw new Error('no body')
  f.blobs.set(body, '{}')
  expect(await store.read({ ...access, reference: ref })).toHaveProperty('failure.kind', 'invalid')
  f.blobs.delete(body)
  expect(await store.read({ ...access, reference: ref })).toHaveProperty(
    'failure.kind',
    'unavailable',
  )
})

it('preserves the model-call source needed to measure retained history after a restart', async () => {
  const f = fixture()
  const sourceCall = ok(decodeModelCallId('mcall_source'))
  const value = {
    ...f.input.value,
    history: {
      ...f.input.value.history,
      entries: f.input.value.history.entries.map(entry => ({ ...entry, sourceCall })),
    },
  }
  const ref = ok(await createSessionCompactionInputs(f.bytes).freeze({ ...f.input, value }))
  const read = ok(await createSessionCompactionInputs(f.bytes).read({ ...access, reference: ref }))
  expect(read.history.entries.map(entry => entry.sourceCall)).toEqual([sourceCall])
})
