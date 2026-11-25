import { expect } from 'vitest'
import { goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import type { GoalCaller } from '@omne-harness/goal-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { treeOf } from '../media-intake/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  type Entry,
  historyOf,
  pollUntil,
  type ReleaseTree,
  textsOf,
} from '../../support/release-tree.ts'

type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]
export type Card = Readonly<{
  ref: { request: { requestId: string }; cardId: string }
  revision: string
  question: { title: string; description: string; options: { id: string; label: string }[] }
}>

export const TYPED = '/goal 把改动说明写进 CHANGELOG'
export const ASKED = 'The person asks for a goal for this session.'
export const DRAFT = {
  purpose: '把改动说明写进 CHANGELOG',
  criteria: [
    {
      statement: '改动说明写进了 CHANGELOG',
      evidence: { kind: 'file', path: 'CHANGELOG.md' },
      pass: { kind: 'shows', text: '有一条讲这次改动的新条目' },
    },
  ],
  rules: [{ statement: '不改公共接口。' }],
}
export const PROPOSE = {
  id: 'call-propose-1',
  tool: 'Goal',
  arguments: JSON.stringify({ command: 'propose', params: { body: DRAFT } }),
}
export const WRITE = {
  id: 'call-write-1',
  tool: 'Files',
  arguments: JSON.stringify({
    command: 'write',
    intent: 'note the change',
    params: { path: 'CHANGELOG.md', mode: 'create', text: '- 首页提速' },
  }),
}
export const SENT_ON = 'You were about to stop, but the goal of this session is not met yet'
const SINCE = new Date(Date.now() - 3_600_000).toISOString()
const BEFORE = new Date(Date.now() + 7_200_000).toISOString()
export const reminders = (entries: readonly Entry[]) =>
  entries
    .filter(entry => entry.kind === 'message.system_reminder')
    .map(entry => textsOf(entry.payload).join('\n'))
export const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length

export type UsageRecord = Readonly<{
  consumer: { purpose: string; position: string }
  labels: { model: string }
  outcome: string
  accounted: boolean
}>
/** The usage records of the decision calls of this tenant, in the order they were asked. */
export async function judgingRecords(tree: ReleaseTree): Promise<readonly UsageRecord[]> {
  const listed = await tree.cli(['list-usage-records', '--since', SINCE, '--before', BEFORE])
  expect(listed.status, listed.stderr).toBe(0)
  const { body } = JSON.parse(listed.stdout) as { body: { entries: UsageRecord[] } }
  return body.entries
    .filter(entry => entry.consumer.purpose === 'judge')
    .toSorted((a, b) => a.consumer.position.localeCompare(b.consumer.position))
}

/** A person types /goal in a settled session, the agent proposes, and the card of the proposal is up. */
export async function proposed(tree: ReleaseTree) {
  const session = await settledSession(tree, 'hello')
  const sent = await tree.clients.session['send-input']({
    tenant: tenantOf(savedTenant(tree.home)),
    session: sessionRef(session),
    acceptId: 'accept-goal-1',
    inputId: 'in-goal-1',
    message: treeOf({
      id: await userMessageId('in-goal-1'),
      role: 'user',
      blocks: [
        { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true }, text: TYPED },
      ],
    }),
  } as unknown as Send)
  expect(sent).toMatchObject({ outcome: 'succeeded' })
  const [item] = await pollUntil(
    'the confirmation card',
    () => tree.cards({ sessionRef: session }),
    cards => cards.length === 1,
  )
  const card = (item as unknown as { card: Card }).card
  return { session, card, ...(await goalsOf(tree, session)) }
}

/** The goals of this tree, and the agent of a session as their caller. */
export async function goalsOf(tree: ReleaseTree, session: string) {
  const text = tenantCodec.encode(tree.registrar().tenant)
  if (!text.ok) throw new Error('the tenant has no text')
  const issued = await toolRuntimeHolder(tree.scope)
    .workPrincipals()
    ?.forSession({
      actor: 'coordinator',
      tenant: tree.registrar().tenant,
      session: session as never,
    })
  if (issued === undefined || !('ok' in issued)) throw new Error(JSON.stringify(issued))
  const agent: GoalCaller = { tenant: text.value, subject: issued.ok }
  const goals = tree.scope.get(goalsKey)
  if (goals === undefined) throw new Error('no goal service')
  return { agent, goals }
}

/** The person confirms the card, and the run the goal stood in comes to its end. */
export async function confirmedToTheEnd(tree: ReleaseTree, session: string, card: Card) {
  const answered = await tree.cli([
    'submit-reply',
    '--request',
    card.ref.request.requestId,
    '--card',
    card.ref.cardId,
    '--revision',
    card.revision,
    '--option',
    card.question.options[0]!.id,
    '--reply-id',
    'reply-goal-1',
  ])
  expect(answered.status, answered.stderr).toBe(0)
  const entries = await pollUntil(
    'the run of the goal to end',
    () => historyOf(tree, session),
    found => count(found, 'run.terminal') === 2,
  )
  expect(count(entries, 'run.started')).toBe(2)
  return entries
}
