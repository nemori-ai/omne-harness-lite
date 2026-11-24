import type { ClientOf } from '@omne-harness/sdk/core'
import type { WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { reasonText } from './words.ts'

type Client = ClientOf<WorkspaceProtocol>
export type CommitName = 'register' | 'grant-participation' | 'remove'
type QueryName = `query-${CommitName}`
type Body<N extends CommitName> = Parameters<Client[N]>[0]

/** A commit whose end is not known yet, kept so it can be asked again with the same body. */
export type Pending = { [N in CommitName]: Readonly<{ name: N; body: Body<N> }> }[CommitName]

/** What a person is told after a commit; `changed` asks the page to read the list again. */
export type Told = Readonly<{ text: string; changed: boolean; pending: Pending | null }>

const VERBS: Readonly<Record<CommitName, string>> = {
  register: '登记',
  'grant-participation': '授予',
  remove: '移除',
}
const SAME: Readonly<Record<CommitName, string>> = {
  register: '这个目录已经登记过了',
  'grant-participation': '对方已经是参与者了',
  remove: '对方本来就不在这个工作区里',
}

type Answer = Readonly<{ outcome: string; body?: unknown }>

function toldOf(name: CommitName, answer: Answer): Told {
  const verb = VERBS[name]
  const said = (text: string, changed = false): Told => ({ text, changed, pending: null })
  switch (answer.outcome) {
    case 'succeeded':
      return said(`已${verb}`, true)
    case 'no-change':
      return said(SAME[name], true)
    case 'invalid':
      return said(`没有${verb}：${reasonText((answer.body as { reason: string }).reason)}`)
    case 'conflict':
      return said(`没有${verb}：和同时进行的改动冲突，读一遍再试`)
    case 'denied':
      return said(`没有${verb}：没有权限`)
    case 'basis-unavailable':
      return said(`没有${verb}：依据暂时读不到`)
    default:
      return said(`没有${verb}成：${answer.outcome}`)
  }
}

async function call(run: () => Promise<Answer>): Promise<Answer> {
  try {
    return await run()
  } catch {
    return { outcome: 'unknown' }
  }
}

// The same body names the same operation, so asking again cannot do the commit a second time.
export async function recheck(client: Client, pending: Pending): Promise<Told> {
  const query = client[`query-${pending.name}` as QueryName] as (body: unknown) => Promise<Answer>
  const answer = await call(() => query(pending.body))
  const verb = VERBS[pending.name]
  switch (answer.outcome) {
    case 'succeeded':
      return { text: `查过了：已${verb}`, changed: true, pending: null }
    case 'not-committed':
      return { text: `查过了：没有${verb}成`, changed: false, pending: null }
    default:
      return { text: `不知道${verb}成没有，可以再查一次`, changed: false, pending }
  }
}

/** Sends a commit; an end it does not learn is asked again once with the same body. */
export async function commit(client: Client, pending: Pending): Promise<Told> {
  const send = client[pending.name] as (body: unknown) => Promise<Answer>
  const answer = await call(() => send(pending.body))
  return answer.outcome === 'unknown' ? recheck(client, pending) : toldOf(pending.name, answer)
}
