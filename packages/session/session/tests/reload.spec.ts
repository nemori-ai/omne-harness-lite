import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FreezeVerdict, WorkSnapshot } from '@omne-harness/session-contract'
import { evidence, operationId, succeeded } from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, advance: true, ...options })
  open.push(h)
  return h
}

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

const reload = (h: Harness, name = 'reload-1') =>
  h.faces('intake').work.reloadSession({ ...h.access(), operation: operationId(name) })

describe('a person reloads a session', () => {
  it('while idle records what the next run adopts, starts no run, and the next run uses it', async () => {
    const h = await service()
    await h.create()
    const pinned = (await read(h)).definition.adopted
    const newer = { ...pinned, digest: 'sha256:newer' }
    let offered = newer
    h.dependencies.evidence.runAdoption = async () => ({
      ok: { kind: 'adopt' as const, candidate: offered },
    })
    const answer = succeeded(await reload(h), 'reload')
    expect(answer.kind).toBe('adopted')
    const after = await read(h)
    expect(after.definition.adopted).toEqual(newer)
    expect(after.run.kind).not.toBe('active')
    expect(succeeded(await reload(h, 'reload-2'), 'reload again')).toEqual({ kind: 'no-change' })
    offered = newer
    await h.accept('input-1')
    await vi.waitFor(async () => {
      const work = await read(h)
      expect(work.run.kind === 'active' && work.run.adoption).toEqual(newer)
    })
  })

  it('answers that the run going on takes it at its end, and writes nothing', async () => {
    const h = await service()
    await h.create()
    await h.accept('input-1')
    await vi.waitFor(async () => expect((await read(h)).run.kind).toBe('active'))
    const before = await read(h)
    expect(succeeded(await reload(h), 'reload')).toEqual({ kind: 'next-run' })
    expect((await read(h)).revision).toBe(before.revision)
  })

  it('keeps the adoption and says why when the new version cannot be used', async () => {
    const h = await service()
    await h.create()
    const before = await read(h)
    h.dependencies.evidence.runAdoption = async () => ({
      ok: { kind: 'keep' as const, reason: 'the new version is refused' },
    })
    expect(await reload(h)).toEqual({
      failure: { kind: 'invalid', field: 'candidate', reason: 'the new version is refused' },
    })
    expect((await read(h)).definition.adopted).toEqual(before.definition.adopted)
  })

  it('freezes the session with the verdict the resident material carries, and says so', async () => {
    const h = await service()
    await h.create()
    const verdict: FreezeVerdict = {
      cause: 'tool-shape-lost',
      capability: 'wordcount',
      evidence: evidence('tool/lost'),
    }
    const pinned = (await read(h)).definition.adopted
    h.dependencies.evidence.runAdoption = async () => ({
      ok: {
        kind: 'adopt' as const,
        candidate: pinned,
        residentAdoption: { residents: [], keys: [], verdict },
      },
    })
    expect(await reload(h)).toEqual({ failure: { kind: 'frozen', verdict } })
    const frozen = await read(h)
    expect(frozen.frozen).toMatchObject({ capability: 'wordcount' })
    expect(await reload(h, 'reload-2')).toMatchObject({ failure: { kind: 'frozen' } })
  })

  it('is refused on an archived session', async () => {
    const h = await service()
    await h.create()
    succeeded(
      await h.faces('intake').work.control({
        ...h.access(),
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      } as never),
      'archive',
    )
    expect(await reload(h)).toEqual({ failure: { kind: 'archived' } })
  })
})
