// Agent 的两种来源（admission 放行卡、agent-extension 扩展件卡）：登记、按会话与来源过滤的池、答复，
// 经公开应用入口、真实 Identity 与真实 SQLite。原工作守卫与来源种类无关，由 tool-origin.spec.ts 覆盖。
import { afterEach, expect, it } from 'vitest'
import {
  RegisterRequestSchema,
  SubmitReplySchema,
  type RegisterRequest,
} from '@omne-harness/human-intervention'
import { inspectRelations } from '../verification/relations.ts'
import { closeOriginWorlds, openOriginWorld, pool, switchableGuards } from './origin-world.ts'
import { database } from './world.ts'

const SESSION = 'session-1'
afterEach(closeOriginWorlds)

const cards = {
  admission: {
    origin: { kind: 'admission', toolCallRef: 'call-1' },
    question: {
      kind: 'admission',
      cardId: 'admit',
      title: 'Run the command?',
      description: 'The agent wants to run `rm notes.txt`',
      declineConsequence: 'The action is not admitted this time',
      options: [
        { id: 'once', label: 'This time', description: 'This time', effectRef: 'grant/once' },
        { id: 'no', label: 'No', description: 'No' },
      ],
    },
  },
  'agent-extension': {
    origin: { kind: 'agent-extension' },
    question: {
      kind: 'extension',
      cardId: 'check',
      title: 'Is the change window open?',
      description: 'The release check needs a person to confirm the window',
      declineConsequence: 'The extension gets no answer',
      options: [{ id: 'open', label: 'Open', description: 'Open' }],
    },
  },
} as const
type Kind = keyof typeof cards

/** 把世界准备的独立登记改成 Agent 一条链的一轮卡片：带会话与 Run，等待由 Agent 拥有。 */
const agentRegistration =
  (kind: Kind) =>
  (request: RegisterRequest): RegisterRequest =>
    RegisterRequestSchema.parse({
      ...request,
      origin: {
        ...cards[kind].origin,
        originRef: 'action-1/admission',
        wait: { ...request.origin.wait, owner: 'agent', waitId: 'action-1/admission/round-1' },
        positionRef: 'action-1',
        adoptionRef: 'v1',
        sessionRef: SESSION,
        runRef: 'run-1',
      },
      questions: [cards[kind].question],
    })

it.each(['admission', 'agent-extension'] as const)(
  'registers a card of the %s origin, lists it by its origin kind and its session, and takes its reply',
  async kind => {
    const { state, guards } = switchableGuards()
    const w = await openOriginWorld(guards, agentRegistration(kind))
    const registered = await w.app.registerRequest(w.principal, w.request)
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    expect(state.calls).toEqual([w.request.origin])

    const listed = await pool(w, { originKind: kind })
    expect(listed).toMatchObject([
      { origin: w.request.origin, card: { kind: 'pending', question: cards[kind].question } },
    ])
    expect(await pool(w, { sessionRef: SESSION })).toEqual(listed)
    expect(await pool(w, { sessionRef: SESSION, originKind: kind })).toEqual(listed)
    expect(await pool(w)).toEqual(listed)
    for (const other of ['tool', 'independent', 'admission', 'agent-extension'] as const)
      if (other !== kind) expect(await pool(w, { originKind: other })).toEqual([])
    expect(await pool(w, { sessionRef: 'session-2', originKind: kind })).toEqual([])

    const reply = await w.app.submitReply(
      w.principal,
      SubmitReplySchema.parse({
        protocol: 'hitl/1',
        operation: w.operation('reply'),
        cardRef: registered.cards[0],
        expectedRevision: registered.revision,
        reply: { kind: 'selection', optionId: cards[kind].question.options[0].id },
      }),
    )
    expect(reply).toMatchObject({ kind: 'decided' })
    expect(
      (await pool(w, { originKind: kind, states: ['decided'] })).map(item => item.card.ref),
    ).toEqual(registered.cards)
    expect(await pool(w, { sessionRef: SESSION, states: ['pending'] })).toEqual([])
    const db = database(w.world.root)
    try {
      expect(inspectRelations(db)).toEqual([])
    } finally {
      db.close()
    }
  },
  30000,
)
