// @module-tag slow
import { describe, expect, it } from 'vitest'
import { goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import { readConfirmOption, type GoalCaller } from '@omne-harness/goal-contract'
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
  onReleaseTree,
  pollUntil,
  type ReleaseTree,
  toolCallsByRequest,
} from '../../support/release-tree.ts'

type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]
type Card = Readonly<{
  ref: { request: { requestId: string }; cardId: string }
  revision: string
  question: { title: string; description: string; options: { id: string; label: string }[] }
}>

const TYPED = '/goal 把首页的加载时间降下来'
const ASKED = 'The person asks for a goal for this session.'
const DRAFT = {
  purpose: '把首页的加载时间降下来',
  criteria: [
    { statement: '端到端用例全过', evidence: { kind: 'command', command: 'pnpm test:e2e' } },
  ],
  rules: [{ statement: '不改公共接口。' }],
}
const PROPOSE = {
  id: 'call-propose-1',
  tool: 'Goal',
  arguments: JSON.stringify({ command: 'propose', params: { body: DRAFT } }),
}
const count = (entries: readonly Entry[], kind: string) =>
  entries.filter(entry => entry.kind === kind).length

describe('/goal on the release tree', () => {
  it(
    'the model reads the typed line and the prompt as two blocks, its proposal puts up a card, and once the person confirms the goal stands and the same run goes on',
    { timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const script = toolCallsByRequest(body => {
        requests.push(body)
        return body.includes(ASKED) && !body.includes('"role":"tool"') ? [PROPOSE] : []
      })
      await onReleaseTree({ script, permission: 'bypass-permissions' }, async tree => {
        const session = await settledSession(tree, 'hello')
        const tenant = tenantOf(savedTenant(tree.home))
        const sent = await tree.clients.session['send-input']({
          tenant,
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
        expect(card.question.title).toBe('确认这个目标')
        expect(card.question.description).toContain('## 目的\n把首页的加载时间降下来')
        expect(card.question.description).toContain('- [A1] 端到端用例全过')
        expect(card.question.options.map(option => option.label)).toEqual(['确认', '不设了'])
        const confirm = card.question.options[0]!.id
        expect(readConfirmOption(confirm)?.base).toEqual({
          generation: 0,
          revision: 0,
          live: false,
        })

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
        expect(await goals.read(agent, session)).toMatchObject({ kind: 'done', value: null })
        const waiting = await historyOf(tree, session)
        expect(count(waiting, 'run.started') - count(waiting, 'run.terminal')).toBe(1)

        const answered = await tree.cli([
          'submit-reply',
          '--request',
          card.ref.request.requestId,
          '--card',
          card.ref.cardId,
          '--revision',
          card.revision,
          '--option',
          confirm,
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
        expect(await goals.read(agent, session)).toMatchObject({
          kind: 'done',
          value: {
            state: { status: 'active', revision: 1, attendance: 'attended' },
            body: { purpose: '把首页的加载时间降下来' },
            history: [{ via: 'card', draftedBy: 'agent', revision: 1 }],
            wake: null,
          },
        })

        const asking = requests.find(body => body.includes(ASKED)) ?? ''
        expect(asking).toContain(TYPED)
        expect(asking).toContain('goal:goal (layer official, version 1), named by the person.')
        expect(asking.indexOf(TYPED)).toBeLessThan(asking.indexOf('named by the person'))
        const person = entries.filter(entry => entry.kind === 'message.user').at(-1)
        if (person === undefined) throw new Error('the typed line is not in the history')
        type Blocks = { text: string; origin?: object }[]
        const { blocks } = (person.payload as { message: { blocks: Blocks } }).message
        expect(blocks).toHaveLength(2)
        expect(blocks[0]).toMatchObject({ text: TYPED })
        expect(blocks[0]?.origin).toBeUndefined()
        expect(blocks[1]?.origin).toMatchObject({ name: 'goal:goal', layer: 'official' })
        const after = requests.at(-1) ?? ''
        expect(requests).toHaveLength(3)
        expect(after).toContain('The person confirmed. The goal stands as revision 1.')
        expect(count(entries, 'message.system_reminder')).toBe(
          count(waiting, 'message.system_reminder'),
        )
      })
    },
  )
})
