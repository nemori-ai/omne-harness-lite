import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { NOT_SENT, refused } from './notices.ts'
import type { Notice } from './session-machine.ts'

type Client = ClientOf<SessionProtocol>
export type WaitingAnswer = Awaited<ReturnType<Client['read-waiting']>>
export type RetryAnswer = Awaited<ReturnType<Client['retry-run']>>

export type Cause = Readonly<{ kind: string; detail: string | null }>

export type WaitingFact =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'not-waiting' }>
  | Readonly<{ kind: 'waiting'; run: string; pending: number; cause: Cause | null }>

export type Retry =
  | Readonly<{ kind: 'idle'; notice: Notice | null }>
  | Readonly<{ kind: 'sending'; run: string; controlId: string }>
  | Readonly<{ kind: 'unknown'; run: string; controlId: string }>
  | Readonly<{ kind: 'no-change' }>

export type Waiting = Readonly<{
  fact: WaitingFact
  retry: Retry
  reading: number | null
  issued: number
  again: boolean
}>

export type WaitingEffect =
  | Readonly<{ kind: 'read-waiting'; session: string; token: number }>
  | Readonly<{ kind: 'retry-run'; session: string; run: string; controlId: string }>

export type WaitingStep = Readonly<{ waiting: Waiting; effects: readonly WaitingEffect[] }>

const IDLE: Retry = { kind: 'idle', notice: null }

export const NO_WAITING: Waiting = {
  fact: { kind: 'unread' },
  retry: IDLE,
  reading: null,
  issued: 0,
  again: false,
}

const keep = (waiting: Waiting): WaitingStep => ({ waiting, effects: [] })

export function readWaiting(waiting: Waiting, session: string): WaitingStep {
  if (waiting.reading !== null) return keep({ ...waiting, again: true })
  const token = waiting.issued + 1
  return {
    waiting: { ...waiting, reading: token, issued: token, again: false },
    effects: [{ kind: 'read-waiting', session, token }],
  }
}

function factOf(answer: WaitingAnswer): WaitingFact {
  if (answer.outcome !== 'succeeded') return { kind: 'unread' }
  const found = answer.body.waiting
  return found === null
    ? { kind: 'not-waiting' }
    : { kind: 'waiting', run: found.run, pending: found.pending, cause: found.cause }
}

const retryInFlight = (retry: Retry): boolean =>
  retry.kind === 'sending' || retry.kind === 'unknown'

export function waitingRead(
  waiting: Waiting,
  session: string,
  token: number,
  answer: WaitingAnswer,
): WaitingStep {
  if (waiting.reading !== token) return keep(waiting)
  const read: Waiting = {
    ...waiting,
    fact: factOf(answer),
    retry: retryInFlight(waiting.retry) ? waiting.retry : IDLE,
    reading: null,
  }
  return waiting.again ? readWaiting(read, session) : keep(read)
}

export function retry(waiting: Waiting, session: string, controlId: string): WaitingStep {
  const held = waiting.retry
  if (held.kind === 'unknown') return send(waiting, session, held.run, held.controlId)
  const fact = waiting.fact
  if (held.kind !== 'idle' || fact.kind !== 'waiting' || fact.pending === 0) return keep(waiting)
  return send(waiting, session, fact.run, controlId)
}

function send(waiting: Waiting, session: string, run: string, controlId: string): WaitingStep {
  return {
    waiting: { ...waiting, retry: { kind: 'sending', run, controlId } },
    effects: [{ kind: 'retry-run', session, run, controlId }],
  }
}

export function retryAnswered(
  waiting: Waiting,
  session: string,
  controlId: string,
  answer: RetryAnswer,
): WaitingStep {
  const held = waiting.retry
  if (held.kind !== 'sending' || held.controlId !== controlId) return keep(waiting)
  switch (answer.outcome) {
    case 'succeeded':
    case 'conflict':
    case 'not-found':
      return readWaiting({ ...waiting, retry: IDLE }, session)
    case 'no-change':
      return keep({ ...waiting, retry: { kind: 'no-change' } })
    case 'unknown':
    case 'uncertain':
      return keep({ ...waiting, retry: { ...held, kind: 'unknown' } })
    case 'unavailable':
      return keep({ ...waiting, retry: { kind: 'idle', notice: NOT_SENT('重试') } })
    default:
      return keep({
        ...waiting,
        retry: { kind: 'idle', notice: refused(answer.outcome, '没有重试：') },
      })
  }
}

const CAUSES: Readonly<Record<string, string>> = {
  'node-failed': '推进这一轮的一个步骤出了故障。',
  'cannot-fit': '当前请求装不进模型的上下文。',
  'compaction-failed': '压缩前面的对话时，压缩服务执行失败。',
  'compaction-invalid': '压缩前面的对话时得到的结果不能用。',
  'request-rejected': '发给模型的请求不合规定，没有发出。',
  'no-reply': '模型没有给出有效的回复。',
  'model-refused': '模型拒绝了这次调用。',
  'message-rejected': '有一条消息没有被接纳。',
  'extension-stop': '一个扩展要求这一轮停下。',
  guard: '守卫停下了这一轮。',
}

export function causeSentence(cause: Cause | null): string {
  if (cause === null) return '这一轮失败了。'
  const known = CAUSES[cause.kind]
  const sentence = known ?? `这一轮失败了，原因是「${cause.kind}」。`
  return cause.detail === null ? sentence : `${sentence}诊断：${cause.detail}`
}
