import { describe, expect, it } from 'vitest'
import { admissionPassageOf, decodeActionId, type Waiting } from '@omne-harness/agent-contract'
import { reconciliationPacer } from '../src/loop/reconciliation.ts'
import { waitForExecutionChange } from '../src/loop/wait.ts'
import { access, evidence, load, ok, open } from './journal-support.ts'
import { eventually, invoke, loopAssembly } from './loop-support.ts'
import { deliverToolSuggestion, toolCall } from './fixtures/tool-call.ts'
import {
  allow,
  ask,
  cardAssembly,
  chosen,
  judgments,
  sleeping,
  waitingForPerson,
} from './loop-cards-support.ts'

const passage = ok(admissionPassageOf(ok(decodeActionId('step-1/tool/0'))))
const human: Waiting = { kind: 'human', passage, cards: [evidence('card/one')] }
const dependency: Waiting = { kind: 'dependency', owner: 'agentReads', position: 'W0' }

describe('a Run waiting on a person wakes on a change of the cards', () => {
  it('re-reads its card and takes the answer when the cards change, while the clock stands still', async () => {
    const assembly = await cardAssembly()
    assembly.controls.admission.admit.always(async call => (call.decision === null ? ask() : allow))
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a')])
    await waitingForPerson(assembly)
    await sleeping(assembly)
    const before = assembly.controls.clock.now()
    const reads = assembly.controls.cards.read.calls.length
    assembly.controls.cards.read.always(async () => ({ ok: chosen }))
    assembly.controls.cards.changes.emit()
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 1)
    expect(assembly.controls.cards.read.calls.length).toBeGreaterThan(reads)
    expect(await judgments(assembly)).toEqual(['allowed'])
    expect(assembly.controls.clock.now()).toBe(before)
  })
})

describe('the card changes a wait listens to', () => {
  async function waiting(waits: readonly Waiting[]) {
    const assembly = await loopAssembly([])
    const opened = await open(assembly.dependencies.journal)
    const snapshot = await load(assembly.dependencies.journal, opened.execution)
    const controller = new AbortController()
    const waited = waitForExecutionChange({
      ports: assembly.dependencies,
      access,
      execution: opened.execution,
      expected: snapshot.revision,
      operations: [],
      waits,
      position: 'W0',
      pacer: reconciliationPacer([10_000]),
      signal: controller.signal,
    })
    await eventually(async () => assembly.controls.clock.pending().length === 1)
    return { assembly, controller, waited }
  }

  it('subscribes only while the wait has a person to hear from, and the subscription ends with the wait', async () => {
    const quiet = await waiting([dependency])
    quiet.assembly.controls.cards.changes.emit()
    expect(quiet.assembly.controls.cards.changes.calls).toHaveLength(0)
    quiet.controller.abort()
    expect(ok(await quiet.waited)).toBe('cancelled')
    quiet.assembly.release.open()

    const asked = await waiting([dependency, human])
    const { changes } = asked.assembly.controls.cards
    expect(changes.calls).toEqual([
      { principal: access.principal, tenant: access.tenant, signal: expect.any(AbortSignal) },
    ])
    expect(changes.open()).toBe(1)
    asked.controller.abort()
    expect(ok(await asked.waited)).toBe('cancelled')
    expect(changes.open()).toBe(0)
    asked.assembly.release.open()
  })

  it('ends the wait as ready on one change and lets the subscription go', async () => {
    const asked = await waiting([human])
    const { changes } = asked.assembly.controls.cards
    changes.emit()
    expect(ok(await asked.waited)).toBe('ready')
    expect(changes.open()).toBe(0)
    expect(asked.assembly.controls.clock.pending()).toHaveLength(0)
    asked.assembly.release.open()
  })
})
