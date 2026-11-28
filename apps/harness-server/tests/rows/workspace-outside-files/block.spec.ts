import { describe, expect, it } from 'vitest'
import {
  createOutsideFilesReader,
  outsideFilesBlock,
  outsideFilesDescriptor,
} from '../../../src/rows/workspace-outside-files/block.ts'
import { TENANT_A } from '../storage/fixtures/tree.ts'

const supplied = (block: ReturnType<typeof outsideFilesBlock>) =>
  block.supply({ tenant: TENANT_A } as Parameters<typeof block.supply>[0])

describe('the block of the setting for files outside the working directory', () => {
  it('is asked at each read, read by the coordinator, and required: nothing stands in for a value', () => {
    expect(outsideFilesDescriptor).toMatchObject({
      key: 'workspace.outside-files',
      kind: 'supplied',
      consumers: ['coordinator'],
      required: true,
      volatility: 'per-read',
      carriesPrevious: false,
    })
  })

  it.each(['none', 'read', 'read-write'] as const)(
    'supplies the level %s the tenant set, asked for that tenant',
    async access => {
      const asked: unknown[] = []
      const block = outsideFilesBlock(async tenant => (asked.push(tenant), access))
      expect(await supplied(block)).toEqual({ kind: 'value', value: { access } })
      expect(asked).toEqual([TENANT_A])
    },
  )

  it('is unavailable when the setting cannot be read: not none, not any other level', async () => {
    expect(await supplied(outsideFilesBlock(async () => null))).toEqual({ kind: 'unavailable' })
  })

  it('takes only a level as its value', () => {
    const judged = (value: unknown) =>
      'issues' in outsideFilesDescriptor.schema['~standard'].validate(value)
    expect(judged({ access: 'read' })).toBe(false)
    for (const value of [{ access: 'all' }, {}, null, 'read']) expect(judged(value)).toBe(true)
  })

  describe('read through the tenant-level scope', () => {
    const holder = (read: () => Promise<unknown>) => {
      const asked: unknown[] = []
      const scope = {
        read: async (principal: unknown, tenant: unknown, request: unknown) => (
          asked.push([principal, tenant, request]),
          (await read()) as never
        ),
      }
      const reader = createOutsideFilesReader<string>({
        scope: () => scope,
        principal: async () => 'acts-for-a',
      })
      return { reader, asked }
    }
    const entries = (...items: unknown[]) => ({ ok: { entries: items, missing: {} } })

    it('answers the level, asking as the coordinator for this one block of this tenant', async () => {
      const { reader, asked } = holder(async () =>
        entries({ key: 'workspace.outside-files', kind: 'value', value: { access: 'read' } }),
      )
      expect(await reader(TENANT_A)).toEqual({ ok: 'read' })
      expect(asked).toEqual([
        [
          'acts-for-a',
          TENANT_A,
          { consumer: 'coordinator', blocks: ['workspace.outside-files'], needs: [] },
        ],
      ])
    })

    it.each<[string, () => Promise<unknown>]>([
      [
        'the block is unavailable',
        async () => entries({ key: 'workspace.outside-files', kind: 'unavailable' }),
      ],
      ['the block is not registered', async () => entries()],
      [
        'the value is not a level',
        async () =>
          entries({ key: 'workspace.outside-files', kind: 'value', value: { access: 'all' } }),
      ],
      ['the read fails', async () => ({ failure: { kind: 'denied' } })],
      ['the read throws', async () => Promise.reject(new Error('gone'))],
    ])('is a failure that says why, never a level, when %s', async (_name, read) => {
      const answer = await holder(read).reader(TENANT_A)
      expect(answer).toEqual({ failure: expect.any(String) })
    })

    it('is a failure when the scope has no holder or nothing acts for the tenant', async () => {
      const absent = createOutsideFilesReader<string>({
        scope: () => undefined,
        principal: async () => 'acts-for-a',
      })
      expect(await absent(TENANT_A)).toEqual({
        failure: 'the holder of the tenant-level scope is not there',
      })
      const nobody = createOutsideFilesReader<string>({
        scope: () => ({ read: async () => entries() as never }),
        principal: async () => null,
      })
      expect(await nobody(TENANT_A)).toEqual({ failure: 'no principal acts for this tenant now' })
    })
  })
})
