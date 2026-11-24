import { describe, expect, it } from 'vitest'
import type { ControlProgress } from '@omne-harness/tool-contract'
import type { ProgramFence } from '@omne-harness/tool-contract/provider'
import { callId, operationId } from './coordinator-values.ts'
import {
  createProgramDisposal,
  programFenceTarget,
  programGuard,
  programGuardsOf,
  stopProgressOf,
} from '../src/program-fence.ts'
import { programConsumer } from '../src/program-source.ts'
import { forwardingFixture } from './forwarding-values.ts'

const parent = callId('call-parent')
const evidence = { owner: 'o', record: 'r', revision: '1', digest: 'd' }

describe('the guard of a position where starts are ordered', () => {
  it('is one per position, and only a call a program made has one', async () => {
    const f = await forwardingFixture({ programs: true })
    expect(programGuard({ parent, ordinal: 2 })).not.toEqual(programGuard({ parent, ordinal: 3 }))
    expect(programGuardsOf(f.parent.request)).toEqual([])
    const made = { ...f.parent.request, consumer: programConsumer(parent, 2) }
    expect(programGuardsOf(made)).toEqual([programGuard({ parent, ordinal: 2 })])
  })
})

describe('TL-66 a call behind the barrier of its program is not started', () => {
  const cut: ProgramFence['cut'] = [
    { ordinal: 1, relation: 'foreground' },
    { ordinal: 2, relation: 'background' },
  ]
  const read = (program: object | null, kind = 'complete') => ({
    read: async () =>
      ({
        kind,
        records: program === null ? [] : [{ kind: 'program', program }],
      }) as never,
  })
  async function asked(store: ReturnType<typeof read>, ordinal: number, inner?: 'denied') {
    const f = await forwardingFixture({ programs: true })
    const target = programFenceTarget(
      store,
      inner === undefined
        ? undefined
        : { qualify: async () => ({ kind: 'denied', reason: 'elsewhere' }) },
    )
    return target.qualify({
      principal: f.parent.principal,
      tenant: f.parent.tenant,
      call: callId('child'),
      request: { ...f.parent.request, consumer: programConsumer(parent, ordinal) },
    })
  }

  it('refuses what the barrier reaches and lets the background of the cut start', async () => {
    const withdrawn = read({
      phase: 'closing',
      fence: { reach: 'foreground', cause: 'withdrawn', cut },
    })
    expect(await asked(withdrawn, 1)).toEqual({ kind: 'denied', reason: 'program-closed' })
    expect(await asked(withdrawn, 2)).toEqual({ kind: 'allowed' })
    const stopped = read({ phase: 'closing', fence: { reach: 'all', cause: 'stopped', cut } })
    expect(await asked(stopped, 2)).toEqual({ kind: 'denied', reason: 'program-closed' })
  })

  it('lets a call start while no barrier stands, and then asks what else judges the target', async () => {
    expect(await asked(read({ phase: 'open' }), 1)).toEqual({ kind: 'allowed' })
    expect(await asked(read({ phase: 'sealed' }), 1)).toEqual({ kind: 'allowed' })
    expect(await asked(read(null), 1)).toEqual({ kind: 'allowed' })
    expect(await asked(read({ phase: 'open' }), 1, 'denied')).toEqual({
      kind: 'denied',
      reason: 'elsewhere',
    })
  })

  it('answers unavailable, never allowed, when the table of the program cannot be read', async () => {
    expect(await asked(read(null, 'unavailable'), 1)).toMatchObject({ kind: 'unavailable' })
  })

  it('does not read the table for a call no program made', async () => {
    const f = await forwardingFixture({ programs: true })
    let reads = 0
    const target = programFenceTarget({ read: async () => (reads++, null as never) }, undefined)
    const { principal, tenant } = f.parent
    expect(
      await target.qualify({
        principal,
        tenant,
        call: callId('direct'),
        request: f.parent.request,
      }),
    ).toEqual({ kind: 'allowed' })
    expect(reads).toBe(0)
  })
})

describe('what a host does for one position behind the barrier', () => {
  it.each([
    [{ kind: 'pending', diagnostic: '' }, 'accepted'],
    [{ kind: 'accepted', evidence }, 'accepted'],
    [{ kind: 'stopped', evidence }, 'stopped'],
    [{ kind: 'already-ended', evidence }, 'stopped'],
    [{ kind: 'relation-changed', evidence }, 'refused'],
    [{ kind: 'rejected', reason: 'no', evidence }, 'refused'],
    [{ kind: 'unknown', diagnostic: '' }, 'unknown'],
  ] as const)('keeps the control progress %j as %s', (progress, kept) => {
    expect(stopProgressOf(progress as ControlProgress)).toBe(kept)
  })

  function disposal(control: () => Promise<unknown>) {
    const invalidated: unknown[] = []
    const controlled: unknown[] = []
    const made = createProgramDisposal<string, never>({
      moveGuard: async input => {
        invalidated.push(input)
        return { ok: evidence }
      },
      commands: {
        control: async input => {
          controlled.push(input)
          return control() as never
        },
      },
    })
    const at = {
      principal: 'alice',
      tenant: {} as never,
      call: callId('child'),
      parent,
      ordinal: 2,
    }
    return { made, at, invalidated, controlled }
  }

  it('bars the start by moving the guard of that position, under one fixed operation', async () => {
    const { made, at, invalidated } = disposal(async () => ({}))
    await made.bar(at)
    await made.bar(at)
    await made.bar({ ...at, ordinal: 3 })
    const [first, again, other] = invalidated as { operation: string; guard: object }[]
    expect(first?.guard).toMatchObject(programGuard({ parent, ordinal: 2 }))
    // It is the host's own step: the principal of the caller is not handed on to be asked again.
    expect(first).not.toHaveProperty('principal')
    expect(again?.operation).toBe(first?.operation)
    expect(other?.operation).not.toBe(first?.operation)
  })

  it('stops the call of the position through its control, under one fixed operation', async () => {
    const { made, at, controlled } = disposal(async () => ({
      ok: { progress: { kind: 'accepted', evidence } },
    }))
    expect(await made.stop(at)).toBe('accepted')
    expect(await made.stop(at)).toBe('accepted')
    const [first, again] = controlled as { operation: string; call: string; intent: object }[]
    expect(first).toMatchObject({ call: callId('child'), intent: { kind: 'stop' } })
    expect(again?.operation).toBe(first?.operation)
  })

  it.each([
    [{ failure: { kind: 'commit-unknown', operation: operationId('x') } }, 'unknown'],
    [{ failure: { kind: 'unavailable', dependency: 'd', diagnostic: '' } }, 'unknown'],
    [{ failure: { kind: 'denied', action: 'control' } }, 'refused'],
  ] as const)('a control that answers %j is kept as %s', async (answer, kept) => {
    expect(await disposal(async () => answer).made.stop(disposal(async () => answer).at)).toBe(kept)
  })

  it('a control that throws is unknown, never refused or stopped', async () => {
    const { made, at } = disposal(async () => {
      throw new Error('gone')
    })
    expect(await made.stop(at)).toBe('unknown')
  })
})
