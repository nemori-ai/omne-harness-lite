import { afterEach, describe, expect, it } from 'vitest'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})
async function service(): Promise<Harness> {
  const h = await harness({ backend: memoryBackend })
  open.push(h)
  await h.create()
  return h
}

describe('a system command a member gave, recorded by Session', () => {
  it('writes its full name and arguments, once per operation, and nothing else', async () => {
    const h = await service()
    const record = (operation: string, name: string, args: string) =>
      h.faces('intake').management.recordCommand({
        ...h.access(),
        operation: operationId(operation),
        name,
        args,
      })
    const first = succeeded(await record('c-1', 'omne-official:model', 'm2'), 'record')
    expect(succeeded(await record('c-1', 'omne-official:model', 'm2'), 'again')).toMatchObject({
      recovered: true,
      first: first.first,
    })
    const read = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(read.pending).toEqual([])
    expect(await record('c-2', 'model', 'm2')).toMatchObject({
      failure: { kind: 'invalid', field: 'name' },
    })
    expect(await record('c-3', 'omne-official:model', 'x'.repeat(4097))).toMatchObject({
      failure: { kind: 'invalid', field: 'args' },
    })
  })

  it('an archived session takes no command', async () => {
    const h = await service()
    succeeded(
      await h.faces('intake').work.control({
        ...h.access(),
        operation: operationId('archive-1'),
        intent: { kind: 'archive' },
      }),
      'archive',
    )
    expect(
      await h.faces('intake').management.recordCommand({
        ...h.access(),
        operation: operationId('c-9'),
        name: 'omne-official:model',
        args: 'm2',
      }),
    ).toMatchObject({ failure: { kind: 'archived' } })
  })
})
