import {
  confirmOptionId,
  DROP_OPTION,
  type Proposal,
  type Proposed,
} from '@omne-harness/goal-contract'
import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolDecision } from '@omne-harness/tool-contract'
import {
  describedAdoption,
  type CheckpointedToolExecutor,
  type ToolSegmentContext,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'
import { goalOf } from './port.ts'
import { tree, type ArgumentsOf } from './protocol.ts'
import {
  NOW_UNAVAILABLE,
  answered,
  completedText,
  reachFrom,
  refused,
  unavailable,
} from './results.ts'

/** What the call ends with when its wait is closed before the person answered. */
export const PROPOSE_CLOSED_RESULT =
  'The card is still open and nothing was set: this call stopped waiting for the answer. Propose again when the person is there to answer.'
const CARD_ID = 'goal'
const STATE_MAX_BYTES = 262_144
const stateAdoption = describedAdoption({
  owner: '@omne-harness/goal-tools',
  name: 'propose-state',
  revision: '1',
  changes: 'The proposal a suspended propose call waits for the answer to.',
})
const encoder = new TextEncoder()
const TITLE_MAX = 256
const TEXTS = {
  set: { title: '确认这个目标', skip: '不设目标，会话照常进行。', confirm: '照这份正文设下目标。' },
  revise: { title: '修改目标', skip: '目标保持原样。', confirm: '照这份正文修改目标。' },
} as const

const proposalOf = (args: ArgumentsOf<'propose'>): Proposal =>
  args.params.changes === undefined
    ? { kind: 'set', draft: args.params.body }
    : { kind: 'revise', changes: args.params.changes }

/** The one card of a proposal: the rendered body, a confirm option that carries its base and digest, and a way out. */
export function cardOf(proposed: Proposed) {
  const texts = TEXTS[proposed.kind]
  const changed = proposed.changed.length === 0 ? '' : `：${proposed.changed.join('、')}`
  return {
    cardId: CARD_ID,
    kind: 'question',
    title: [...`${texts.title}${changed}`].slice(0, TITLE_MAX).join(''),
    description: proposed.rendered,
    declineConsequence: texts.skip,
    options: [
      {
        id: confirmOptionId(proposed.base, proposed.digest),
        label: '确认',
        description: texts.confirm,
      },
      { id: DROP_OPTION, label: '不设了', description: texts.skip },
    ],
  } as const
}

const AnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('selection'), cardId: z.literal(CARD_ID), optionId: z.string() }),
  z.object({ kind: z.literal('text'), cardId: z.literal(CARD_ID), text: z.string() }),
  z.object({ kind: z.literal('no-answer'), cardId: z.literal(CARD_ID) }),
])
const ResponseSchema = z.object({ answers: z.tuple([AnswerSchema]) })

type Reply =
  | Readonly<{ kind: 'confirmed' }>
  | Readonly<{ kind: 'words'; text: string }>
  | Readonly<{ kind: 'dropped' }>

/** What the person answered on the card. Only the confirm option confirms; their own words are changes they want. */
export function replyOf(response: ToolDecision<unknown>): Reply | undefined {
  if (response.kind !== 'answer') return { kind: 'dropped' }
  const parsed = ResponseSchema.safeParse(response.value)
  if (!parsed.success) return undefined
  const [answer] = parsed.data.answers
  if (answer.kind === 'text') return { kind: 'words', text: answer.text }
  const dropped = answer.kind === 'no-answer' || answer.optionId === DROP_OPTION
  return dropped ? { kind: 'dropped' } : { kind: 'confirmed' }
}

function kept(checkpoint: Uint8Array): Proposal | undefined {
  try {
    const read = JSON.parse(new TextDecoder().decode(checkpoint)) as Proposal
    return read.kind === 'set' || read.kind === 'revise' ? read : undefined
  } catch {
    return undefined
  }
}

const NOT_SET =
  'The person chose not to. Nothing was set and the goal, if there is one, stands as it was.'
const wants = (text: string) =>
  `The person did not confirm. They answered with what they want changed:\n${text}\nNothing was set. Redraft with that and propose again.`

/** propose runs in two segments: it checks the proposal and puts up the card, then acts on the answer. */
export const proposeExecutor: CheckpointedToolExecutor<ArgumentsOf<'propose'>, string, null> = {
  checkpoint: {
    schema: {
      id: '@omne-harness/goal-tools/propose-state',
      revision: '1',
      digest: stateAdoption.digest,
    },
    codec: stateAdoption,
    maxBytes: STATE_MAX_BYTES,
  },
  async initial(args, _environment, context: ToolSegmentContext) {
    const ready = await reachFrom('propose', goalOf(context))
    if (!('reached' in ready)) return ready
    const { goals, caller, session } = ready.reached
    const proposal = proposalOf(args)
    const asked = await goals
      .propose(caller, { session, proposal })
      .catch(() => ({ kind: 'basis-unavailable' }) as const)
    if (asked.kind === 'refused') return refused(asked.reason)
    if (asked.kind !== 'done') return unavailable('propose', NOW_UNAVAILABLE)
    return succeed({
      kind: 'suspended',
      state: encoder.encode(JSON.stringify(proposal)),
      closedResult: PROPOSE_CLOSED_RESULT,
      wait: {
        kind: 'ask',
        key: 'propose',
        contract: hitlDecisionWait,
        request: tree({ questions: [cardOf(asked.value)] }),
      },
    })
  },
  async resume({ checkpoint, response }, _environment, context) {
    const proposal = kept(checkpoint)
    const reply = replyOf(response)
    if (proposal === undefined || reply === undefined)
      return fail({
        kind: 'invalid',
        reason: 'the answer is not the answer to the card of this call',
      })
    const done = (text: string) =>
      succeed({ kind: 'completed' as const, value: completedText('propose', text) })
    if (reply.kind === 'dropped') return done(NOT_SET)
    if (reply.kind === 'words') return done(wants(reply.text))
    const ready = await reachFrom('propose', goalOf(context))
    if (!('reached' in ready)) return ready
    const { goals, caller, session } = ready.reached
    const written = await goals
      .confirm(caller, { session, card: ready.bound.call, proposal, words: null })
      .catch(() => ({ kind: 'unknown' }) as const)
    const result = answered('propose', written, record => {
      const { revision } = record.state
      return `The person confirmed. The goal stands as revision ${String(revision)}. Go on with the work in this turn; use show to read it and how far you are.`
    })
    return 'failure' in result ? result : succeed({ kind: 'completed', value: result.ok })
  },
}
