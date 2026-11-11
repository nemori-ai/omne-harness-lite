// Tool 来源的卡片与原工作守卫，经公开应用入口、真实 Identity 与真实 SQLite。守卫参与者是替身
// （fixtures/guard.mjs）；Session 的真实守卫 session.run-live 由 session-storage-sql 自己的测试覆盖。
import { afterEach, expect, it } from 'vitest'
import {
  GetRequestSchema,
  GetWaitSchema,
  InvalidateWaitSchema,
  RegisterRequestSchema,
  SubmitReplySchema,
  type RegisterRequest,
} from '@omne-harness/human-intervention'
import {
  IndependentCommandSchema,
  independentControlCommands,
  type HitlGuards,
} from '@omne-harness/human-intervention-local'
import { operationKey } from '../src/encoding.ts'
import { inspectRelations } from '../verification/relations.ts'
import { closeOriginWorlds, openOriginWorld, pool, switchableGuards } from './origin-world.ts'
import { database } from './world.ts'

const SESSION = 'session-1'
afterEach(closeOriginWorlds)

function toolRegistration(request: RegisterRequest): RegisterRequest {
  return RegisterRequestSchema.parse({
    ...request,
    origin: {
      kind: 'tool',
      originRef: 'tool-call/1',
      wait: { ...request.origin.wait, owner: 'tool', waitId: 'call-1/wait-1' },
      positionRef: 'call-1',
      adoptionRef: 'v1',
      toolCallRef: 'call-1',
      sessionRef: SESSION,
      runRef: 'run-1',
    },
    questions: [
      ...request.questions,
      {
        kind: 'approval',
        cardId: 'approve',
        title: 'Delete the file?',
        description: 'The agent wants to delete notes.txt',
        declineConsequence: 'No verdict; the action does not run',
        options: [
          { id: 'allow', label: 'Allow', description: 'Run it' },
          { id: 'deny', label: 'Deny', description: 'Do not run it' },
        ],
      },
    ],
  })
}
const open = (guards: HitlGuards, tool = true) =>
  openOriginWorld(guards, tool ? toolRegistration : undefined)
type World = Awaited<ReturnType<typeof open>>
/** 由可信原工作拥有者另准备一个独立等待，再经公开入口登记。 */
async function registerIndependent(w: World) {
  const request = RegisterRequestSchema.parse({
    ...w.request,
    operation: w.operation('register-independent'),
    preparationRef: 'prepared-independent',
    origin: {
      kind: 'independent',
      originRef: 'form',
      wait: { ...w.request.origin.wait, owner: 'independent', waitId: 'independent-1' },
      positionRef: 'step-a',
      adoptionRef: 'v1',
    },
    questions: w.request.questions.slice(0, 1),
  })
  const prepare = IndependentCommandSchema.parse({
    kind: 'prepare',
    operation: w.operation('prepare-independent'),
    preparation: {
      registration: request,
      readers: [w.request.operation.actorRef],
      responders: [w.request.operation.actorRef],
      compatibleImplementations: ['v1'],
    },
  })
  const prepared = await w.world.storage.commit({
    identity: {
      ...w.world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(w.operation('prepare-independent')),
    },
    combinationVersion: w.world.combination.combinationVersion,
    manifestDigest: w.world.combination.manifestDigest,
    commands: independentControlCommands(prepare),
  })
  if (prepared.kind !== 'committed') throw new Error(JSON.stringify(prepared))
  const registered = await w.app.registerRequest(w.principal, request)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return request
}
function waitQuery(w: World) {
  return GetWaitSchema.parse({ protocol: 'hitl/1', waitRef: w.request.origin.wait })
}

it('registers a tool card batch and lists it in the pool and in its session, each card with its decline consequence', async () => {
  const { state, guards } = switchableGuards()
  const w = await open(guards)
  const registered = await w.app.registerRequest(w.principal, w.request)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  expect(state.calls).toEqual([w.request.origin])
  const independent = await registerIndependent(w)

  const expected = w.request.questions.map(question => ({
    origin: w.request.origin,
    card: { kind: 'pending', question },
  }))
  const inSession = await pool(w, { sessionRef: SESSION })
  expect(inSession).toMatchObject(expected)
  expect(inSession.map(item => item.card.question.declineConsequence)).toEqual([
    'Skip this question',
    'No verdict; the action does not run',
  ])
  expect(await pool(w, { sessionRef: SESSION, originKind: 'tool' })).toEqual(inSession)
  expect(await pool(w, { originKind: 'tool' })).toEqual(inSession)
  expect(await pool(w, { sessionRef: 'session-2' })).toEqual([])
  expect(await pool(w, { sessionRef: SESSION, originKind: 'independent' })).toEqual([])
  expect((await pool(w, { originKind: 'independent' })).map(item => item.origin)).toEqual([
    independent.origin,
  ])
  const all = await pool(w)
  expect(all.slice(0, 2)).toEqual(inSession)
  expect(all.map(item => item.origin.kind)).toEqual(['tool', 'tool', 'independent'])

  expect(
    await w.app.getRequest(
      w.principal,
      GetRequestSchema.parse({ protocol: 'hitl/1', requestRef: registered.requestRef }),
    ),
  ).toMatchObject({ kind: 'found', request: { origin: w.request.origin } })
  expect(await w.app.getWait(w.principal, waitQuery(w))).toMatchObject({
    kind: 'found',
    wait: { state: 'waiting' },
  })

  const reply = await w.app.submitReply(
    w.principal,
    SubmitReplySchema.parse({
      protocol: 'hitl/1',
      operation: w.operation('reply'),
      cardRef: registered.cards[1],
      expectedRevision: registered.revision,
      reply: { kind: 'decline' },
    }),
  )
  expect(reply).toMatchObject({ kind: 'decided' })
  expect(state.calls).toEqual([w.request.origin, independent.origin, w.request.origin])
  expect(
    (await pool(w, { sessionRef: SESSION, states: ['decided'] })).map(item => item.card.ref),
  ).toEqual([registered.cards[1]])
  expect(
    (await pool(w, { sessionRef: SESSION, states: ['pending'] })).map(i => i.card.ref),
  ).toEqual([registered.cards[0]])
  const db = database(w.world.root)
  try {
    expect(inspectRelations(db)).toEqual([])
  } finally {
    db.close()
  }
}, 30000)

it('returns unavailable when a session-bound origin gets no guard, for both registration and reply', async () => {
  const { state, guards } = switchableGuards()
  const w = await open(guards)
  state.verdict = 'none'
  expect(await w.app.registerRequest(w.principal, w.request)).toEqual({
    kind: 'unavailable',
    reason: 'session-guard-missing',
    operationRef: w.request.operation,
  })
  expect(await pool(w)).toEqual([])
  expect(await w.app.getWait(w.principal, waitQuery(w))).toMatchObject({ kind: 'not-found' })

  state.verdict = 'live'
  const registered = await w.app.registerRequest(w.principal, w.request)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  state.verdict = 'none'
  const reply = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef: registered.cards[0],
    expectedRevision: registered.revision,
    reply: { kind: 'selection', optionId: 'yes' },
  })
  expect(await w.app.submitReply(w.principal, reply)).toEqual({
    kind: 'unavailable',
    reason: 'session-guard-missing',
    operationRef: reply.operation,
  })
  expect((await pool(w, { states: ['pending'] })).map(item => item.card.ref)).toEqual(
    registered.cards,
  )
}, 30000)

it('rolls back the whole registration when the original work guard rejects', async () => {
  const { state, guards } = switchableGuards()
  const w = await open(guards)
  state.verdict = 'ended'
  const rejected = {
    kind: 'conflict',
    reason: 'guard-rejected',
    operationRef: w.request.operation,
  }
  expect(await w.app.registerRequest(w.principal, w.request)).toEqual(rejected)
  // Identity 结算时已封口这次操作，重试得到封口冲突，不会再写入。
  expect(await w.app.registerRequest(w.principal, w.request)).toEqual({
    ...rejected,
    reason: 'operation-sealed',
  })
  expect(await pool(w)).toEqual([])
  expect(await w.app.getWait(w.principal, waitQuery(w))).toMatchObject({ kind: 'not-found' })
}, 30000)

it('rolls back the whole reply when the original work guard rejects, but never guards invalidation', async () => {
  const { state, guards } = switchableGuards()
  const w = await open(guards)
  const registered = await w.app.registerRequest(w.principal, w.request)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  state.verdict = 'ended'
  const reply = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef: registered.cards[0],
    expectedRevision: registered.revision,
    reply: { kind: 'text', text: 'go ahead' },
  })
  expect(await w.app.submitReply(w.principal, reply)).toEqual({
    kind: 'conflict',
    reason: 'guard-rejected',
    operationRef: reply.operation,
  })
  expect(await pool(w, { states: ['decided'] })).toEqual([])
  expect(await w.app.getWait(w.principal, waitQuery(w))).toMatchObject({
    kind: 'found',
    wait: { state: 'waiting' },
  })

  const calls = state.calls.length
  const invalidated = await w.app.invalidateWait(
    w.principal,
    InvalidateWaitSchema.parse({
      protocol: 'hitl/1',
      operation: w.operation('invalidate'),
      waitRef: w.request.origin.wait,
      terminalEvidenceRef: 'session-archived',
      reason: 'archived',
    }),
  )
  expect(invalidated).toMatchObject({ kind: 'invalidated', affected: 2 })
  expect(state.calls).toHaveLength(calls)
  expect((await pool(w, { states: ['invalidated'] })).map(item => item.card.ref)).toEqual(
    registered.cards,
  )

  // A late reply to a card that is closed already is told so. The original work is over, so its
  // guard still rejects the commit; the state of the card answers, not the guard.
  const late = SubmitReplySchema.parse({ ...reply, operation: w.operation('late-reply') })
  expect(await w.app.submitReply(w.principal, late)).toEqual({
    kind: 'invalidated',
    reason: 'archived',
    operationRef: late.operation,
  })
}, 30000)

it('tells a late reply the decision of a card that was answered before the original work ended', async () => {
  const { state, guards } = switchableGuards()
  const w = await open(guards)
  const registered = await w.app.registerRequest(w.principal, w.request)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const reply = SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: w.operation('reply'),
    cardRef: registered.cards[0],
    expectedRevision: registered.revision,
    reply: { kind: 'text', text: 'go ahead' },
  })
  const decided = await w.app.submitReply(w.principal, reply)
  if (decided.kind !== 'decided') throw new Error(JSON.stringify(decided))
  state.verdict = 'ended'
  const late = SubmitReplySchema.parse({
    ...reply,
    operation: w.operation('late-reply'),
    reply: { kind: 'text', text: 'something else' },
  })
  expect(await w.app.submitReply(w.principal, late)).toMatchObject({
    kind: 'already-decided',
    decision: { reply: { kind: 'text', text: 'go ahead' } },
    operationRef: late.operation,
  })
}, 30000)

it('passes the independent origin to the assembly and registers it without a guard', async () => {
  const { state, guards } = switchableGuards()
  const w = await open(guards, false)
  const registered = await w.app.registerRequest(w.principal, w.request)
  expect(registered).toMatchObject({ kind: 'registered' })
  expect(state.calls).toEqual([w.request.origin])
  expect((await pool(w, { originKind: 'independent' })).map(item => item.origin)).toEqual([
    w.request.origin,
  ])
}, 30000)
