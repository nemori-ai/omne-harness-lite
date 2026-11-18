import type {
  Access,
  Action,
  ActionBatch,
  ActionToolCall,
  AgentExecutionId,
  Authority,
  CardRoundId,
  Failure,
  Passage,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import {
  afterAdmission,
  chainOf,
  handBackOf,
  judgedAgain,
  needOfAction,
  withChosenRewrite,
} from './admission-chain.ts'
import type { cardClosing } from './card-closing.ts'
import { AGENT_OWNER } from './identities.ts'
import { localFailure } from './node-failure.ts'
import { admitToolAction, type HandBack, type ToolAdmission } from './tools.ts'

type Ports<P> = Pick<
  AgentDependencies<P, ContentBlock>,
  'admission' | 'toolRequests' | 'materials' | 'clock'
>
type Judging<P> = Readonly<{
  ports: Ports<P>
  access: Access<P>
  execution: AgentExecutionId
  authority: Authority
  closing: ReturnType<typeof cardClosing<P>>
}>
type Answer = Extract<ToolAdmission, { kind: 'judged' | 'allowed' }>
type Ended = Extract<
  Awaited<ReturnType<Judging<unknown>['closing']['endRefused']>>,
  { ok: unknown }
>

/** What one pass over a batch came to: every action answered, or the batch must wait, or it ended. */
export type BatchJudgment =
  | Readonly<{
      kind: 'answered'
      answers: readonly Answer[]
      passages: readonly Passage[]
      opened: readonly CardRoundId[]
    }>
  | Readonly<{ kind: 'wait'; failure: Extract<Failure, { kind: 'unavailable' }> }>
  | Readonly<{ kind: 'ended'; checkpoint: Ended['ok'] }>

type Verdict = Exclude<ToolAdmission, { kind: 'unavailable' | 'refused' }>
type Asked =
  | Readonly<{ kind: 'verdict'; verdict: Verdict }>
  | Exclude<BatchJudgment, { kind: 'answered' }>

const wait = (owner: string, diagnostic: string): BatchJudgment => ({
  kind: 'wait',
  failure: { kind: 'unavailable', owner, diagnostic },
})

type Pass<P> = Readonly<{
  judging: Judging<P>
  batch: ActionBatch
  originals: ReadonlyMap<string, ActionToolCall>
  answers: Answer[]
  opened: CardRoundId[]
}> & { passages: readonly Passage[]; mark: Readonly<{ id: ActionBatch['id']; pass: string }> }
/** Null lets the pass go on; anything else is what the whole batch came to. */
type Halt = Exclude<BatchJudgment, { kind: 'answered' }>
type Step = Outcome<Halt | null, Failure>
const GO_ON: Step = succeed(null)

async function ask<P>(
  pass: Pass<P>,
  action: Action,
  original: ActionToolCall,
  handBack: HandBack | null,
): Promise<Outcome<Asked, Failure>> {
  const { ports, access, execution, authority, closing } = pass.judging
  const admitted = await admitToolAction(
    ports,
    access,
    execution,
    authority,
    action,
    original,
    handBack,
    pass.mark,
  )
  if ('failure' in admitted) return admitted
  if (admitted.ok.kind === 'unavailable')
    return succeed(wait(admitted.ok.owner, admitted.ok.diagnostic) as Asked)
  if (admitted.ok.kind !== 'refused') return succeed({ kind: 'verdict', verdict: admitted.ok })
  const ended = await closing.endRefused(
    pass.batch,
    pass.answers,
    pass.passages,
    pass.opened,
    admitted.ok,
  )
  return 'failure' in ended ? ended : succeed({ kind: 'ended', checkpoint: ended.ok })
}

async function record<P>(
  pass: Pass<P>,
  verdict: Verdict,
  chain: ReturnType<typeof chainOf>,
): Promise<Step> {
  if (chain === null && verdict.kind !== 'asked') {
    pass.answers.push(
      verdict.kind === 'denied' ? { kind: 'judged', action: verdict.action } : verdict,
    )
    return GO_ON
  }
  const instant = await pass.judging.ports.clock.now()
  if ('failure' in instant) return instant
  const judged = afterAdmission(pass.passages, verdict, chain, instant.ok)
  if ('failure' in judged)
    return fail(
      localFailure('invariant', {
        kind: 'unavailable',
        owner: `${AGENT_OWNER}#defect`,
        diagnostic: `A0: ${judged.failure.step} is not defined here`,
      }),
    )
  pass.passages = judged.ok.passages
  if (judged.opened !== undefined) pass.opened.push(judged.opened)
  pass.answers.push(
    verdict.kind === 'allowed' ? verdict : { kind: 'judged', action: judged.ok.action },
  )
  return GO_ON
}

async function judge<P>(pass: Pass<P>, action: Action): Promise<Step> {
  if (needOfAction(pass.passages, action) !== 'judge') {
    pass.answers.push({ kind: 'judged', action })
    return GO_ON
  }
  const chain = chainOf(pass.passages, action)
  const handBack = handBackOf(chain)
  const original = pass.originals.get(action.original.callId)
  if (original === undefined)
    return fail({
      kind: 'invalid',
      field: 'original.callId',
      reason: 'the preserved reply has no tool call of this call id',
    })
  const asked = await ask(pass, withChosenRewrite(action, chain, handBack), original, handBack)
  if ('failure' in asked) return asked
  return asked.ok.kind === 'verdict' ? record(pass, asked.ok.verdict, chain) : succeed(asked.ok)
}

// An action that no longer needs asking leaves its card and takes the verdict, unless the person spoke first.
async function supersede<P>(
  pass: Pass<P>,
  index: number,
  action: Action,
  chain: NonNullable<ReturnType<typeof chainOf>>,
  verdict: Extract<Verdict, { kind: 'allowed' | 'denied' }>,
): Promise<Step> {
  const { closing } = pass.judging
  const settled = await closing.endSuperseded(pass.batch, action, chain, pass.passages, verdict)
  if ('failure' in settled) {
    const { failure } = settled
    return failure.kind === 'unavailable'
      ? succeed(wait(failure.owner, failure.diagnostic) as Halt)
      : settled
  }
  pass.passages = settled.ok.passages
  pass.answers[index] =
    verdict.kind === 'allowed' && !settled.ok.heard
      ? verdict
      : { kind: 'judged', action: settled.ok.action }
  return GO_ON
}

// An action still waiting for the person is asked again, without its card.
async function judgeAgain<P>(pass: Pass<P>, index: number, action: Action): Promise<Step> {
  const again = judgedAgain(pass.passages, action)
  const chain = chainOf(pass.passages, action)
  const original = pass.originals.get(action.original.callId)
  if (again === null || chain === null || original === undefined) return GO_ON
  const asked = await ask(pass, again, original, null)
  if ('failure' in asked) return asked
  if (asked.ok.kind !== 'verdict') return succeed(asked.ok)
  const { verdict } = asked.ok
  return verdict.kind === 'allowed' || verdict.kind === 'denied'
    ? supersede(pass, index, action, chain, verdict)
    : GO_ON
}

export async function judgeBatch<P>(
  judging: Judging<P>,
  batch: ActionBatch,
  originals: ReadonlyMap<string, ActionToolCall>,
  saved: readonly Passage[],
): Promise<Outcome<BatchJudgment, Failure>> {
  const pass: Pass<P> = {
    judging,
    batch,
    originals,
    mark: { id: batch.id, pass: globalThis.crypto.randomUUID() },
    answers: [],
    opened: [],
    passages: saved,
  }
  for (const action of batch.actions) {
    const step = await judge(pass, action)
    if ('failure' in step) return step
    if (step.ok !== null) return succeed(step.ok)
  }
  // The waiting actions come again as a pass of their own: it reads what the first one wrote.
  pass.mark = { id: batch.id, pass: globalThis.crypto.randomUUID() }
  for (const [index, action] of batch.actions.entries()) {
    const step = await judgeAgain(pass, index, action)
    if ('failure' in step) return step
    if (step.ok !== null) return succeed(step.ok)
  }
  const { answers, passages, opened } = pass
  return succeed({ kind: 'answered', answers, passages, opened })
}
