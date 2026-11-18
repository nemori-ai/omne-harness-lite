import { describe, expect, it } from 'vitest'
import type { DenialCategory } from '@omne-harness/agent-contract'
import { evidence, ok } from './journal-support.ts'
import { eventually, invoke } from './loop-support.ts'
import { deliverToolSuggestion, toolCall } from './fixtures/tool-call.ts'
import {
  allow,
  ask,
  cardAssembly,
  chosen,
  judgments,
  nextCheck,
  secondModelCall,
  snapshot,
  toolMessages,
  waitingForPerson,
  type Admit,
  type Assembly,
} from './loop-cards-support.ts'

const PROHIBITED =
  'The tool call did not run: the person prohibited this capability, so later calls to it are denied too.'
const three = [toolCall('call-a'), toolCall('call-b'), toolCall('call-c')]
const deny = (category: DenialCategory): Admit => ({
  ok: { kind: 'deny', category, reason: category, evidence: evidence(`deny/${category}`) },
})
const round = (ordinal: number) => `step-1/tool/${ordinal}/admission/round/1`

// The person answers only the card of the first action; the admission answers `after` from then on.
async function answeredOnce(after: (callId: string) => Admit) {
  const assembly = await cardAssembly()
  let answered = false
  assembly.controls.admission.admit.always(async call => {
    if (call.decision !== null) answered = true
    return answered ? after(call.original.callId) : ask()
  })
  assembly.controls.cards.invalidate.always(async call => ({
    ok: call.cards.map(card => ({
      card,
      reply: { kind: 'invalidated', evidence: evidence('withdrawn') } as const,
    })),
  }))
  ok(await invoke(assembly))
  await deliverToolSuggestion(assembly, three)
  await waitingForPerson(assembly)
  expect(await judgments(assembly)).toEqual(['waiting', 'waiting', 'waiting'])
  return assembly
}

async function answerFirst(assembly: Assembly) {
  assembly.controls.cards.read.always(async call => ({
    ok: call.card.record.includes('tool/0') ? chosen : { kind: 'pending' },
  }))
  await nextCheck(assembly)
}

const answersHandedBack = (assembly: Assembly) =>
  assembly.controls.admission.admit.calls.filter(call => call.decision !== null)

describe('an answer in a batch judges the actions still waiting again', () => {
  it('withdraws their cards and runs every action once the session allows them: the person answered once', async () => {
    const assembly = await answeredOnce(() => allow)
    await answerFirst(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 3)
    expect(assembly.controls.cards.invalidate.calls.map(call => call.round)).toEqual([
      round(1),
      round(2),
    ])
    expect(answersHandedBack(assembly).map(call => call.original.callId)).toEqual(['call-a'])
    expect(assembly.controls.cards.present.calls).toHaveLength(3)
    expect((await toolMessages(assembly)).length).toBe(0)
  })

  it('asks the waiting actions again in a pass of their own, after the pass that carried the answer', async () => {
    const assembly = await answeredOnce(() => allow)
    const { calls } = assembly.controls.admission.admit
    const before = calls.length
    await answerFirst(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 3)
    const asked = calls.slice(before)
    const carried = asked.filter(call => call.decision !== null).map(call => call.batch?.pass)
    const again = asked.filter(call => call.decision === null).map(call => call.batch?.pass)
    expect(carried).toEqual([expect.any(String)])
    expect(again).toHaveLength(2)
    expect(new Set(again).size).toBe(1)
    expect(again[0]).not.toBe(carried[0])
  })

  it('withdraws their cards and runs none once the capability is prohibited', async () => {
    const assembly = await answeredOnce(() => deny('prohibited'))
    await answerFirst(assembly)
    await secondModelCall(assembly)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    expect(assembly.controls.cards.invalidate.calls.map(call => call.round)).toEqual([
      round(1),
      round(2),
    ])
    expect(answersHandedBack(assembly)).toHaveLength(1)
    const texts = (await toolMessages(assembly)).map(message =>
      message.blocks.flatMap(block => (block.kind === 'text' ? [block.text] : [])),
    )
    expect(texts).toEqual([[PROHIBITED], [PROHIBITED], [PROHIBITED]])
  })

  it('leaves the card of an action that still needs asking, and opens no second round for it', async () => {
    const assembly = await answeredOnce(callId => (callId === 'call-a' ? allow : ask()))
    await answerFirst(assembly)
    await eventually(async () => (await judgments(assembly))?.[0] === 'allowed')
    await waitingForPerson(assembly)
    expect(await judgments(assembly)).toEqual(['allowed', 'waiting', 'waiting'])
    expect(assembly.controls.cards.invalidate.calls).toHaveLength(0)
    expect(assembly.controls.cards.present.calls).toHaveLength(3)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
  })

  it('waits and judges the batch again when the admission cannot answer for a waiting action now', async () => {
    let failing = true
    const assembly = await answeredOnce(callId =>
      callId === 'call-b' && failing
        ? { ok: { kind: 'unavailable', diagnostic: 'the session cannot be read now' } }
        : allow,
    )
    await answerFirst(assembly)
    await eventually(async () => {
      const { state } = await snapshot(assembly)
      return state.kind === 'waiting' && state.waits.some(wait => wait.kind === 'dependency')
    })
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    failing = false
    await nextCheck(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 3)
    expect(answersHandedBack(assembly).every(call => call.original.callId === 'call-a')).toBe(true)
  })

  it('hears a person who answered a card before it was withdrawn, and judges with that answer', async () => {
    const assembly = await answeredOnce(() => allow)
    assembly.controls.cards.invalidate.always(async call => ({
      ok: call.cards.map(card => ({
        card,
        reply: call.round === round(1) ? chosen : { kind: 'invalidated', evidence: evidence('w') },
      })),
    }))
    await answerFirst(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 3)
    expect(answersHandedBack(assembly).map(call => call.original.callId)).toEqual([
      'call-a',
      'call-b',
    ])
  })

  it('does not settle a waiting action while its card could not be withdrawn, and withdraws by the same operation again', async () => {
    const assembly = await answeredOnce(() => allow)
    const { invalidate } = assembly.controls.cards
    invalidate.once(async () => ({
      failure: { kind: 'unavailable', owner: 'agentDecisionCards', diagnostic: 'not now' },
    }))
    await answerFirst(assembly)
    await eventually(async () => invalidate.calls.length >= 1)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    await nextCheck(assembly)
    await eventually(async () => assembly.controls.tools.invoke.calls.length === 3)
    const first = invalidate.calls.filter(call => call.round === round(1))
    expect(first.length).toBeGreaterThanOrEqual(2)
    expect(new Set(first.map(call => call.operation)).size).toBe(1)
  })
})
