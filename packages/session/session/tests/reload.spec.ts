import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  expectedRevision,
  type FreezeVerdict,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionSlotReference } from '../src/slot-reference.ts'
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

/** A session with a run going on, its Agent drive counted, and a newer version on offer. */
async function running() {
  const h = await service()
  await h.create()
  await h.accept('input-1')
  await vi.waitFor(async () => expect((await read(h)).run.kind).toBe('active'))
  const before = await read(h)
  const newer = { ...before.definition.adopted, digest: 'sha256:newer' }
  h.dependencies.evidence.runAdoption = async () => ({
    ok: { kind: 'adopt' as const, candidate: newer },
  })
  const methods: string[] = []
  h.drive.handOver = counted(methods, 'handOver', h.drive.handOver.bind(h.drive))
  h.drive.resume = counted(methods, 'resume', h.drive.resume.bind(h.drive))
  driven.set(h, methods)
  return { h, before, newer }
}

const driven = new WeakMap<Harness, string[]>()
const asked = (h: Harness) => driven.get(h) ?? []
const counted =
  <A extends unknown[], R>(into: string[], name: string, call: (...args: A) => R) =>
  (...args: A): R => {
    into.push(name)
    return call(...args)
  }

async function endRun(h: Harness): Promise<void> {
  const snapshot = await read(h)
  if (snapshot.run.kind !== 'active') return
  const finished = succeeded(
    await h.backend.transactions.commit({
      access: h.access(),
      command: {
        kind: 'finishRun',
        input: {
          ...h.access(),
          operation: operationId('finish'),
          run: snapshot.run.run,
          expected: expectedRevision(snapshot, 'finishRun'),
          bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
        },
      },
      guards: [],
    }),
    'finishRun',
  )
  h.instance.committed({
    tenant: snapshot.tenant,
    session: h.access().session,
    revision: finished.receipt.revision,
    source: finished.receipt.source,
    kinds: ['run.terminal'],
  })
}

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

  it('with a run going on, hands it over: the same run goes on in one more attempt, under the new version', async () => {
    const { h, before, newer } = await running()
    const answer = succeeded(await reload(h), 'reload')
    expect(answer.kind).toBe('handed-over')
    const after = await read(h)
    if (after.run.kind !== 'active' || before.run.kind !== 'active') throw new Error('no run')
    expect(after.run.run).toBe(before.run.run)
    expect(after.run.adoption).toEqual(newer)
    expect(after.run.advance?.attempt).not.toBe(before.run.advance?.attempt)
    expect(after.run.advance?.instance).toEqual(sessionSlotReference(h.access().session, newer))
    expect(asked(h)).toEqual(['handOver', 'resume'])
  })

  it('refuses a second reload handed the same handover once the first joined it, and writes nothing for it', async () => {
    const { h, before } = await running()
    const handOver = h.drive.handOver.bind(h.drive)
    const firstHanded = Promise.withResolvers<void>()
    const firstDone = Promise.withResolvers<void>()
    let calls = 0
    h.drive.handOver = async input => {
      calls += 1
      const call = calls
      const handed = await handOver(input)
      if (call === 1) await firstHanded.promise
      else {
        firstHanded.resolve()
        await firstDone.promise
      }
      return handed
    }
    const first = reload(h, 'reload-1')
    const second = reload(h, 'reload-2')
    expect(succeeded(await first, 'first').kind).toBe('handed-over')
    const joined = await read(h)
    firstDone.resolve()
    expect(await second).toEqual({ failure: { kind: 'stale-advance', current: null } })
    const after = await read(h)
    expect(after.revision).toBe(joined.revision)
    if (after.run.kind !== 'active' || before.run.kind !== 'active') throw new Error('no run')
    expect(BigInt(after.run.ordinal)).toBe(BigInt(before.run.ordinal) + 1n)
  })

  it('freezes when the new version keeps no resident shape, and the run goes on in the old version untouched', async () => {
    const { h, before } = await running()
    const verdict: FreezeVerdict = {
      cause: 'tool-shape-lost',
      capability: 'wordcount',
      evidence: evidence('tool/lost'),
    }
    h.dependencies.evidence.runAdoption = async () => ({
      ok: {
        kind: 'adopt' as const,
        candidate: { ...before.definition.adopted, digest: 'sha256:newer' },
        residentAdoption: { residents: [], keys: [], verdict },
      },
    })
    expect(await reload(h)).toEqual({ failure: { kind: 'frozen', verdict } })
    expect(asked(h)).toEqual([])
    const after = await read(h)
    expect(after.frozen).toMatchObject({ capability: 'wordcount' })
    if (after.run.kind !== 'active' || before.run.kind !== 'active') throw new Error('no run')
    expect(after.run.advance).toEqual(before.run.advance)
    expect(after.run.adoption).toEqual(before.run.adoption)
  })

  it('does not hand over a run whose cancel came first: the new version waits for the next run', async () => {
    const { h, before, newer } = await running()
    if (before.run.kind !== 'active') throw new Error('no run')
    succeeded(
      await h.faces('intake').work.cancelRun({
        ...h.access(),
        operation: operationId('cancel-1'),
        run: before.run.run,
        urgency: 'graceful',
      }),
      'cancel',
    )
    expect(succeeded(await reload(h), 'reload').kind).toBe('adopted')
    expect(asked(h)).toEqual([])
    const after = await read(h)
    expect(after.run.kind).not.toBe('active')
    expect(after.definition.adopted).toEqual(newer)
  })

  it('writes nothing when the Agent does not hand over, and the run goes on as it was', async () => {
    const { h, before } = await running()
    h.drive.handOver = async () => ({ failure: { kind: 'stale-advance' } })
    expect(await reload(h)).toEqual({ failure: { kind: 'stale-advance', current: null } })
    const after = await read(h)
    expect(after.revision).toBe(before.revision)
    expect(after.definition.adopted).toEqual(before.definition.adopted)
  })

  it('takes the idle branch when the run ends while it is asked', async () => {
    const { h, newer } = await running()
    h.drive.handOver = async () => {
      await endRun(h)
      return { failure: { kind: 'terminal' } }
    }
    expect(succeeded(await reload(h), 'reload').kind).toBe('adopted')
    const after = await read(h)
    expect(after.run.kind).not.toBe('active')
    expect(after.definition.adopted).toEqual(newer)
  })

  it('writes nothing when the commit is refused after the handover, and the recovery takes the run on in the old version', async () => {
    const { h, before } = await running()
    const ran = before.run
    if (ran.kind !== 'active') throw new Error('no run')
    const refusal = { kind: 'conflict', operation: operationId('reload-1') } as const
    h.view.onCommit((input, next) =>
      input.command.kind === 'reload' ? Promise.resolve({ failure: refusal }) : next(),
    )
    expect(await reload(h)).toEqual({ failure: refusal })
    await vi.waitFor(async () => {
      const after = await read(h)
      if (after.run.kind !== 'active') throw new Error('no run')
      expect(after.run.advance?.attempt).not.toBe(ran.advance?.attempt)
      expect(after.run.adoption).toEqual(ran.adoption)
      expect(after.definition.adopted).toEqual(before.definition.adopted)
    })
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

  it('asks the adoption source for the run going on and names itself, and commits the resident material it gives', async () => {
    const { h, before, newer } = await running()
    if (before.run.kind !== 'active') throw new Error('no run')
    const asked: unknown[] = []
    const residentAdoption = { residents: [], keys: [] }
    h.dependencies.evidence.runAdoption = async (_access, input) => {
      asked.push({ run: input.run, point: input.point })
      return { ok: { kind: 'adopt' as const, candidate: newer, residentAdoption } }
    }
    const reloads: unknown[] = []
    h.view.onCommit((input, next) => {
      if (input.command.kind === 'reload') reloads.push(input.command.input)
      return next()
    })
    expect(succeeded(await reload(h), 'reload').kind).toBe('handed-over')
    expect(asked).toEqual([{ run: before.run.run, point: operationId('reload-1') }])
    expect(reloads).toMatchObject([{ run: before.run.run, residentAdoption }])
  })

  it('answers a frozen session without asking the adoption source', async () => {
    const { h, before } = await running()
    const verdict: FreezeVerdict = {
      cause: 'tool-shape-lost',
      capability: 'wordcount',
      evidence: evidence('tool/lost'),
    }
    h.dependencies.evidence.runAdoption = async () => ({
      ok: {
        kind: 'adopt' as const,
        candidate: before.definition.adopted,
        residentAdoption: { residents: [], keys: [], verdict },
      },
    })
    expect(await reload(h)).toEqual({ failure: { kind: 'frozen', verdict } })
    let asked = 0
    h.dependencies.evidence.runAdoption = async () => {
      asked += 1
      return {
        ok: {
          kind: 'adopt' as const,
          candidate: { ...before.definition.adopted, digest: 'sha256:newer' },
        },
      }
    }
    expect(await reload(h, 'reload-2')).toMatchObject({ failure: { kind: 'frozen' } })
    expect(asked).toBe(0)
  })

  it('answers no change while no adoption source is wired', async () => {
    const { h, before } = await running()
    delete (h.dependencies.evidence as { runAdoption?: unknown }).runAdoption
    expect(await reload(h)).toEqual({ ok: { kind: 'no-change' } })
    expect((await read(h)).revision).toBe(before.revision)
  })

  it('writes nothing when no Agent drive is there to hand the run over', async () => {
    const { h, before } = await running()
    h.setDrive(false)
    expect(await reload(h)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect((await read(h)).revision).toBe(before.revision)
  })

  it('leaves a run it could not join to the recovery, in the new version', async () => {
    const { h, before, newer } = await running()
    const ran = before.run
    if (ran.kind !== 'active') throw new Error('no run')
    const resume = h.drive.resume.bind(h.drive)
    let refused = 0
    h.drive.resume = async input => {
      if (refused === 0) {
        refused += 1
        return { failure: { kind: 'busy' } }
      }
      return resume(input)
    }
    expect(succeeded(await reload(h), 'reload').kind).toBe('handed-over')
    await vi.waitFor(async () => {
      const after = await read(h)
      if (after.run.kind !== 'active') throw new Error('no run')
      expect(BigInt(after.run.ordinal)).toBe(BigInt(ran.ordinal) + 2n)
      expect(after.run.adoption).toEqual(newer)
    })
  })

  it('asks the Agent at most three times while the run is ending, then says so', async () => {
    const { h, before } = await running()
    let asked = 0
    h.drive.handOver = async () => {
      asked += 1
      return { failure: { kind: 'terminal' } }
    }
    expect(await reload(h)).toEqual({ failure: { kind: 'run-active' } })
    expect(asked).toBe(3)
    expect((await read(h)).revision).toBe(before.revision)
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
