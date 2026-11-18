import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import type { ClientOf } from '@omne-harness/sdk/core'
import { COMMON_SENTENCES, refusal, type Notice } from './notices.ts'

type Client = ClientOf<AssetsProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>

/** How a creation ended at the server, or which of its steps stopped it. */
export type CreateAnswer =
  | Answer<'create-asset'>
  | Answer<'commit-asset-upload'>
  | Exclude<Answer<'begin-asset-upload'>, { outcome: 'succeeded' }>
  | Exclude<Answer<'append-asset-upload'>, { outcome: 'succeeded' }>
  | Readonly<{ outcome: 'stalled' }>

export type CreateRecallAnswer = Answer<'query-asset-operation'>

export type Manifest = readonly Readonly<{ path: string; bytes: number }>[]

export type CreateRequest =
  | Readonly<{ kind: 'data'; name: string; body: JsonValue }>
  | Readonly<{ kind: 'directory'; name: string; manifest: Manifest }>

export type Creating =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'sending'; operation: string; request: CreateRequest; received: number }>
  | Readonly<{
      kind: 'unknown'
      operation: string
      request: CreateRequest
      confirming: boolean
      notice: Notice
    }>
  | Readonly<{ kind: 'done'; text: string }>
  | Readonly<{ kind: 'refused'; notice: Notice }>

export type CreationEvent =
  | Readonly<{ kind: 'create'; operation: string; request: CreateRequest }>
  | Readonly<{ kind: 'create-progress'; operation: string; received: number }>
  | Readonly<{ kind: 'create-answered'; operation: string; answer: CreateAnswer }>
  | Readonly<{ kind: 'confirm-create' }>
  | Readonly<{ kind: 'confirm-create-answered'; operation: string; answer: CreateRecallAnswer }>

export type CreationEffect =
  | Readonly<{ kind: 'create'; operation: string; request: CreateRequest }>
  | Readonly<{ kind: 'recall-create'; operation: string; request: CreateRequest }>

export type CreationStep = Readonly<{
  creating: Creating
  effects: readonly CreationEffect[]
  /** The list is read again: the creation changed what the server holds. */
  reread: boolean
}>

export const NOT_CREATING: Creating = { kind: 'none' }

const SENTENCES: Readonly<Record<string, string>> = {
  ...COMMON_SENTENCES,
  'not-found': '这次上传已经过期或不在了，没有新建。请重新提交。',
  conflict: '同名的这一份正在别处改，没有新建。已重新读取。',
  limited: '同时在传的太多，稍后再试。',
  stalled: '上传没有往前走，没有新建。',
  'basis-unavailable': '服务端暂时读不出需要的依据，没有新建。稍后再试。',
}

const UNKNOWN: Notice = {
  kind: 'unknown',
  text: '结果不明：可能已经建了，也可能没有。认回一下再决定。',
}

const noticeOf = (outcome: string): Notice =>
  refusal(outcome, SENTENCES[outcome] ?? `服务端答：${outcome}。`)

const same = (creating: Creating): CreationStep => ({ creating, effects: [], reread: false })

type Settled = Readonly<{ outcome: string; body?: unknown }>

function invalidText(body: unknown): string {
  const { reason, missing } = (body ?? {}) as { reason?: string; missing?: readonly string[] }
  const lacking = missing === undefined || missing.length === 0 ? '' : `缺：${missing.join('、')}。`
  return `服务端没有收下：${reason ?? '不合这一类的规定'}。${lacking}`
}

/** One answer of a creation or of its recall, as the slot records it. */
function settle(
  request: CreateRequest,
  operation: string,
  answer: Settled,
  listed: boolean,
): CreationStep {
  const { name } = request
  switch (answer.outcome) {
    case 'succeeded': {
      const changed = (answer.body as { changed?: boolean } | undefined)?.changed !== false
      const text = !changed
        ? `${name} 的内容和现在的这一版相同，没有变化。`
        : listed
          ? `已成为 ${name} 的新版本。`
          : `已新建 ${name}。`
      return { creating: { kind: 'done', text }, effects: [], reread: true }
    }
    case 'invalid':
      return same({ kind: 'refused', notice: { kind: 'refused', text: invalidText(answer.body) } })
    case 'unknown':
    case 'uncertain':
      return same({ kind: 'unknown', operation, request, confirming: false, notice: UNKNOWN })
    case 'conflict':
      return {
        creating: { kind: 'refused', notice: noticeOf('conflict') },
        effects: [],
        reread: true,
      }
    default:
      return same({ kind: 'refused', notice: noticeOf(answer.outcome) })
  }
}

const busy = (creating: Creating): boolean =>
  creating.kind === 'sending' || creating.kind === 'unknown'

/** The creation slot of one category: one creation at a time, an unknown one recalled, not resent. */
export function stepCreation(
  creating: Creating,
  event: CreationEvent,
  listed: (name: string) => boolean,
): CreationStep {
  switch (event.kind) {
    case 'create': {
      if (busy(creating)) return same(creating)
      const { operation, request } = event
      return {
        creating: { kind: 'sending', operation, request, received: 0 },
        effects: [{ kind: 'create', operation, request }],
        reread: false,
      }
    }
    case 'create-progress':
      return creating.kind === 'sending' && creating.operation === event.operation
        ? same({ ...creating, received: event.received })
        : same(creating)
    case 'create-answered':
      return creating.kind === 'sending' && creating.operation === event.operation
        ? settle(creating.request, creating.operation, event.answer, listed(creating.request.name))
        : same(creating)
    case 'confirm-create':
      if (creating.kind !== 'unknown' || creating.confirming) return same(creating)
      return {
        creating: { ...creating, confirming: true },
        effects: [
          { kind: 'recall-create', operation: creating.operation, request: creating.request },
        ],
        reread: false,
      }
    case 'confirm-create-answered': {
      if (creating.kind !== 'unknown' || !creating.confirming) return same(creating)
      if (creating.operation !== event.operation) return same(creating)
      const { outcome } = event.answer
      if (outcome === 'not-committed')
        return same({
          kind: 'refused',
          notice: { kind: 'unavailable', text: '上一次没有生效，可以再试一次。' },
        })
      if (outcome === 'unavailable' || outcome === 'uncertain' || outcome === 'basis-unavailable')
        return same({ ...creating, confirming: false, notice: noticeOf(outcome) })
      return settle(
        creating.request,
        creating.operation,
        event.answer,
        listed(creating.request.name),
      )
    }
  }
}
