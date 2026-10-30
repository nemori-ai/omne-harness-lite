// The one execution slot and what a caller can read of it: when a failed invoke gives the slot
// back, that `observe` shows the state the slot implies, and that the registration handle only
// receives a projection. busy, the same operation again and the R0 item are in
// loop-admission.spec.ts. A stopped run has no contract state or channel of its own (S-14 of
// #558): it is read from the Journal's `position` and from `observe`.
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type { AgentEvaluator, LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import { adoption, execution, failure, instance, ok } from './journal-support.ts'
import {
  alice,
  eventually,
  invoke,
  loopAssembly,
  selected,
  shown,
  stoppedAt,
  type LoopAssembly,
} from './loop-support.ts'

/** Redefines the bound definition with another evaluator or extensions. */
function adopt(
  assembly: LoopAssembly,
  evaluator: AgentEvaluator,
  extensions: readonly LoopExtensionDeclaration[] = [],
): void {
  assembly.controls.adoptions.define(adoption('definition'), {
    definition: {
      category: 'AgentDefinition',
      name: 'test',
      references: [],
      attributes: [],
    },
    evaluator,
    extensions,
  })
}

describe('P1 stops when the re-selection differs (#502 1.2 stand-in for the P1 self-loop of 1.5)', () => {
  const changes: readonly (readonly [string, typeof selected.recipient])[] = [
    ['route', { ...selected.recipient, route: 'route-2' }],
    [
      'profile owner',
      { ...selected.recipient, profile: { ...selected.recipient.profile, owner: 'other' } },
    ],
    [
      'profile name',
      { ...selected.recipient, profile: { ...selected.recipient.profile, name: 'other' } },
    ],
    [
      'profile revision',
      { ...selected.recipient, profile: { ...selected.recipient.profile, revision: '2' } },
    ],
    [
      'profile digest',
      { ...selected.recipient, profile: { ...selected.recipient.profile, digest: 'other' } },
    ],
  ]
  it.each(changes)('a changed %s stops the run at P1', async (_, recipient) => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    assembly.controls.selection.select.once(() => succeed(selected))
    assembly.controls.selection.select.once(() => succeed({ ...selected, recipient }))
    ok(await invoke(assembly))
    await stoppedAt(assembly, 'P1')
  })
})

describe('observe wakes on a change of the slot', () => {
  it('an observation open before invoke shows idle, then occupied', async () => {
    const assembly = await loopAssembly([execution()])
    const controller = new AbortController()
    const sequence = assembly.provider.observation
      .observe({ ...alice, signal: controller.signal })
      [Symbol.asyncIterator]()
    expect((await sequence.next()).value).toEqual({
      kind: 'state',
      value: { kind: 'idle', instance: instance() },
    })
    const next = sequence.next()
    ok(await invoke(assembly))
    expect((await next).value).toMatchObject({
      kind: 'state',
      value: { kind: 'occupied', execution: execution() },
    })
    controller.abort()
    expect((await sequence.next()).value).toEqual({ kind: 'ended', reason: 'closed' })
    assembly.release.open()
  })
})

describe('slot release before E1 (SPEC 受理与单执行槽)', () => {
  it('an adopted loop extension refuses invoke before open and gives the slot back', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    const extension: LoopExtensionDeclaration = {
      name: 'observer',
      position: 'execution_started',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'observer' },
    }
    adopt(assembly, agentEvaluator, [extension])
    expect(failure(await invoke(assembly))).toEqual({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: 'an adopted loop extension is not implemented until #502 stage 3',
    })
    expect(await shown(assembly)).toEqual({ kind: 'idle', instance: instance() })
    adopt(assembly, agentEvaluator)
    ok(await invoke(assembly, 'exec-2'))
    assembly.release.open()
  })
})

describe('E4 stops outside the normal path (#502 1.2 limit)', () => {
  it('a thrown value that cannot become text stops at E4 without an unhandled rejection', async () => {
    const assembly = await loopAssembly([execution()])
    adopt(assembly, {
      ...agentEvaluator,
      next: () => {
        throw Object.create(null)
      },
    })
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)
    try {
      ok(await invoke(assembly))
      expect((await stoppedAt(assembly, 'E4')).kind).not.toBe('ended')
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onRejection)
    }
  })

  it.each(['terminal', 'superseded'] as const)(
    'a stop (%s) keeps the execution at E4',
    async reason => {
      const assembly = await loopAssembly([execution()])
      adopt(assembly, {
        ...agentEvaluator,
        next: () => succeed({ kind: 'stop', reason }),
      })
      ok(await invoke(assembly))
      expect((await stoppedAt(assembly, 'E4')).kind).not.toBe('ended')
    },
  )

  it('an outcome without a table row stops as a coordinator defect', async () => {
    const assembly = await loopAssembly([execution()])
    adopt(assembly, {
      ...agentEvaluator,
      next: () => succeed({ kind: 'wait', waiting: [] }),
    })
    ok(await invoke(assembly))
    expect((await stoppedAt(assembly, 'E4')).kind).not.toBe('ended')
  })
})

describe('the registration handle only receives a projection', () => {
  it('a report that throws neither fails invoke nor holds the slot after E9', async () => {
    const reported: string[] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => ({
      ...dependencies,
      registration: {
        instance: instance(),
        report({ state }) {
          reported.push(state.kind)
          throw new Error('host report failed')
        },
        withdraw: () => Promise.resolve(succeed(null)),
      },
    }))
    ok(await invoke(assembly))
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(reported).toEqual(['occupied', 'idle'])
    ok(await invoke(assembly, 'exec-2'))
  })
})
