import { Context } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import type { ToolCallId, ToolWaitId } from '@omne-harness/tool-contract'
import type { ToolDecisionBridge } from '@omne-harness/tool-contract/provider'
import { toolCommandsKey } from '@omne-harness/tool-cordis-contract/cordis'
import { expect, it } from 'vitest'
import {
  mountDecisionRoute,
  releaseToolDecisions,
} from '../../../src/rows/tool-runtime/decision-routes.ts'
import { fixtureTenant } from '../../entry/support.ts'

const WAIT = 'w1' as ToolWaitId
const ACCESS = {
  principal: 'driver',
  tenant: fixtureTenant('a'),
  call: 'c1' as ToolCallId,
  wait: WAIT,
}
const person = { owner: 'human', name: 'decision-wait' }
const report = { owner: 'dispatch', name: 'report-wait' }

function bridgeNamed(name: string): ToolDecisionBridge<unknown> {
  const inspect = () =>
    Promise.resolve(
      succeed({
        registration: { owner: name, record: 'r', revision: '1', digest: 'sha256:r' },
        decision: null,
      }),
    )
  return { inspect } as never
}

/** A tree whose Tool commands answer that the one wait of the call has this request contract. */
function treeWaitingBy(contract: typeof person) {
  const ctx = new Context()
  const waits = [{ phase: 'open', intent: { kind: 'ask', wait: WAIT, schemas: { contract } } }]
  ctx.provide(toolCommandsKey)
  ctx.set(toolCommandsKey, {
    loadRecovery: () => Promise.resolve(succeed({ waits, tasks: [] })),
  } as never)
  return ctx
}

const ownerOf = async (ctx: Context) => {
  const answer = await releaseToolDecisions(ctx).inspect(ACCESS)
  return 'ok' in answer ? answer.ok.registration.owner : answer.failure
}

it('sends a wait to the bridge mounted for its contract, among the bridges of several owners', async () => {
  const ctx = treeWaitingBy(report)
  mountDecisionRoute(ctx, { contract: person, bridge: () => bridgeNamed('person') })
  mountDecisionRoute(ctx, { contract: report, bridge: () => bridgeNamed('report') })
  expect(await ownerOf(ctx)).toBe('report')
  expect(await ownerOf(treeWaitingBy(person))).toMatchObject({ kind: 'unavailable' })
})

it('withdraws only the route of the scope that is disposed, and the bridge built before sees it', async () => {
  const ctx = treeWaitingBy(report)
  const decisions = releaseToolDecisions(ctx)
  mountDecisionRoute(ctx, { contract: person, bridge: () => bridgeNamed('person') })
  const scope = ctx.plugin(inner => {
    mountDecisionRoute(inner, { contract: report, bridge: () => bridgeNamed('report') })
  })
  await scope
  expect(await decisions.inspect(ACCESS)).toMatchObject({
    ok: { registration: { owner: 'report' } },
  })
  await scope.dispose()
  expect(await decisions.inspect(ACCESS)).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'tool-decisions' },
  })
  const withPerson = treeWaitingBy(person)
  mountDecisionRoute(withPerson, { contract: person, bridge: () => bridgeNamed('person') })
  expect(await ownerOf(withPerson)).toBe('person')
})

it('answers that the basis is unavailable while the tree has no Tool commands', async () => {
  const ctx = new Context()
  mountDecisionRoute(ctx, { contract: report, bridge: () => bridgeNamed('report') })
  expect(await ownerOf(ctx)).toEqual({
    kind: 'unavailable',
    dependency: 'tool-decisions',
    diagnostic: 'tool commands are absent',
  })
})
