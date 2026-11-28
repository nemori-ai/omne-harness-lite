import type { McpBody, McpCreating, McpEndpoint, McpNotice, McpSnapshot, McpText } from './port.ts'

export type Auth = 'none' | 'static' | 'oauth'

export type Entered = Readonly<{
  name: string
  target: string
  auth: Auth
  key: string
  clientId: string
  clientSecret: string
}>

/** One setting written after the endpoint is made; a secret goes only to the secret custody. */
export type Placing = Readonly<{ item: string; secret: boolean; value: string }>

export const ITEM_LABEL: Readonly<Record<string, string>> = {
  target: '地址',
  credential: '密钥',
  'client-id': '客户端标识',
  'client-secret': '客户端密钥',
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const ADDRESS = /^(?:https:\/\/\S+|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/\S*)?)$/u

export type Problems = Readonly<{ name?: string; target?: string }>

export function problemsOf(entered: Entered, listed: (name: string) => boolean): Problems {
  const name = entered.name.trim()
  const target = entered.target.trim()
  return {
    ...(!NAME.test(name) || name.length > 64
      ? { name: '名字只能有小写字母、数字和短横，不超过 64 个字。' }
      : listed(name)
        ? { name: `已经有一个叫 ${name} 的接入点：换一个名字，或者到它那一段里改地址。` }
        : {}),
    ...(ADDRESS.test(target)
      ? {}
      : {
          target: '地址要以 https:// 开头；本机的服务才能用 http://127.0.0.1 或 http://localhost。',
        }),
  }
}

const text = (value: string): McpText => ({ kind: 'string', value })

export function bodyOf(entered: Entered): McpBody {
  return {
    kind: 'object',
    entries: [
      { key: 'name', value: text(entered.name.trim()) },
      { key: 'transport', value: text('streamable-http') },
      { key: 'auth', value: text(entered.auth) },
    ],
  }
}

/** The settings to write once it is made, in order; only what was filled in, only what its kind of auth has. */
export function placingsOf(entered: Entered): readonly Placing[] {
  const filled = (item: string, secret: boolean, value: string): Placing[] =>
    value.trim() === '' ? [] : [{ item, secret, value: secret ? value : value.trim() }]
  return [
    ...filled('target', false, entered.target),
    ...(entered.auth === 'static' ? filled('credential', true, entered.key) : []),
    ...(entered.auth === 'oauth'
      ? [
          ...filled('client-id', false, entered.clientId),
          ...filled('client-secret', true, entered.clientSecret),
        ]
      : []),
  ]
}

/** Where one 新建 stands: the cells of the table in the run's design, one variant each. */
export type Phase =
  | Readonly<{ kind: 'editing'; notice?: McpNotice }>
  | Readonly<{ kind: 'creating'; name: string; placings: readonly Placing[]; before: McpCreating }>
  | Readonly<{ kind: 'placing'; name: string; placings: readonly Placing[]; sent: string | null }>
  | Readonly<{ kind: 'placed'; name: string }>
  | Readonly<{ kind: 'stopped'; name: string; item: string; notice: McpNotice }>

export type Act = Readonly<{ key: string; placing: Placing }>

export type Advanced = Readonly<{ phase: Phase; act?: Act }>

const rowOf = (endpoint: McpEndpoint, item: string) =>
  endpoint.rows.find(row => row.view.kind !== 'permission' && row.view.item === item)

function created(phase: Extract<Phase, { kind: 'creating' }>, creating: McpCreating): Advanced {
  // An answer from before this 新建 is not its answer.
  if (creating === phase.before) return { phase }
  switch (creating.kind) {
    case 'none':
    case 'sending':
    case 'unknown':
      return { phase }
    case 'refused':
      return { phase: { kind: 'editing', notice: creating.notice } }
    case 'done':
      return { phase: { kind: 'placing', name: phase.name, placings: phase.placings, sent: null } }
  }
}

function placed(
  phase: Extract<Phase, { kind: 'placing' }>,
  holdings: readonly McpEndpoint[],
): Advanced {
  const [next, ...rest] = phase.placings
  if (next === undefined) return { phase: { kind: 'placed', name: phase.name } }
  const endpoint = holdings.find(each => each.name === phase.name)
  const row = endpoint === undefined ? undefined : rowOf(endpoint, next.item)
  if (row === undefined) return { phase }
  if (phase.sent !== row.key)
    return { phase: { ...phase, sent: row.key }, act: { key: row.key, placing: next } }
  switch (row.write.kind) {
    case 'none':
    case 'submitting':
      return { phase }
    case 'succeeded':
      return placed({ ...phase, placings: rest, sent: null }, holdings)
    case 'unknown':
    case 'unconfirmed':
    case 'refused':
      return {
        phase: { kind: 'stopped', name: phase.name, item: next.item, notice: row.write.notice },
      }
  }
}

/** The next step of one 新建 for what the governance port says now, and the write to send, if any. */
export function advance(phase: Phase, snapshot: McpSnapshot): Advanced {
  if (snapshot.kind !== 'read') return { phase }
  switch (phase.kind) {
    case 'creating': {
      const next = created(phase, snapshot.creating)
      return next.phase.kind === 'placing' ? advance(next.phase, snapshot) : next
    }
    case 'placing':
      return placed(phase, snapshot.holdings)
    case 'editing':
    case 'placed':
    case 'stopped':
      return { phase }
  }
}
