// @module-tag slow
import { describe, expect, it } from 'vitest'
import { goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import type { GoalCaller, Proposal } from '@omne-harness/goal-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { goalHolder } from '../../../src/rows/goal/holder.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  textsOf,
  toolCallsThenText,
} from '../../support/release-tree.ts'

const SET: Proposal = {
  kind: 'set',
  draft: {
    purpose: '把首页的加载时间降下来',
    criteria: [
      { statement: '端到端用例全过', evidence: { kind: 'command', command: 'pnpm test:e2e' } },
    ],
  },
}
const HELP = {
  id: 'call-help-1',
  tool: 'Agents',
  arguments: JSON.stringify({ command: 'help', params: {} }),
}
const terminals = (entries: readonly { kind: string }[]) =>
  entries.filter(entry => entry.kind === 'run.terminal').length

describe('the goal rows on the release tree', () => {
  it(
    'the agent of a session reads and proposes but sets nothing; the reminder a goal owes opens a run of the session',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree(
        {
          script: toolCallsThenText(body =>
            body.includes('Say hello.') && !body.includes('"role":"tool"') ? [HELP] : [],
          ),
          permission: 'bypass-permissions',
          extraHistoryKinds: ['message.system_reminder'],
        },
        async tree => {
          const { tenant } = tree.registrar()
          const session = await tree.startSession('Say hello.')
          await pollUntil(
            'the first run of the session',
            () => historyOf(tree, session),
            entries => terminals(entries) === 1,
          )
          const text = tenantCodec.encode(tenant)
          if (!text.ok) throw new Error('the tenant has no text')
          const issued = await toolRuntimeHolder(tree.scope)
            .workPrincipals()
            ?.forSession({ actor: 'coordinator', tenant, session: session as never })
          if (issued === undefined || !('ok' in issued)) throw new Error(JSON.stringify(issued))
          const goals = tree.scope.get(goalsKey)
          if (goals === undefined) throw new Error('no goal service')
          const agent: GoalCaller = { tenant: text.value, subject: issued.ok }

          expect(await goals.read(agent, session)).toEqual({
            kind: 'done',
            value: null,
            recalled: false,
          })
          const proposed = await goals.propose(agent, { session, proposal: SET })
          expect(proposed).toMatchObject({
            kind: 'done',
            value: { kind: 'set', base: { generation: 0, revision: 0, live: false } },
          })
          const direct = {
            session,
            operation: 'op-1',
            proposal: SET,
            words: null,
            draftedBy: 'person',
            by: 'the-agent-itself',
          } as const
          expect(await goals.write(agent, direct)).toEqual({
            kind: 'refused',
            reason: { kind: 'denied' },
          })
          for (const kind of ['pause', 'resume', 'cancel', 'abort'] as const)
            expect(await goals.command(agent, { session, command: { kind } })).toEqual({
              kind: 'refused',
              reason: { kind: 'denied' },
            })
          expect(await goals.read({ ...agent, subject: {} }, session)).toMatchObject({
            kind: 'refused',
            reason: { kind: 'denied' },
          })
          expect(
            await goals.confirm(agent, { session, card: 'no-card', proposal: SET, words: null }),
          ).toEqual({ kind: 'basis-unavailable' })
          expect(await goals.read(agent, session)).toMatchObject({ kind: 'done', value: null })

          const sessions = goalHolder(tree.scope).sessions
          if (sessions === null) throw new Error('the session port is not mounted')
          const facts = await sessions.facts(text.value, session)
          if (facts.kind !== 'read' || facts.value === null) throw new Error(JSON.stringify(facts))
          expect(facts.value.attendance).toBe('attended')
          expect(BigInt(facts.value.moment)).toBeGreaterThan(0n)

          const calls = goalHolder(tree.scope).calls
          if (calls === null) throw new Error('the check of cited calls is not mounted')
          const cited = ['call-help-1', 'call-nobody-made']
          expect(await calls.cited(text.value, session, cited, '0')).toEqual({
            kind: 'read',
            value: ['call-help-1'],
          })
          expect(await calls.cited(text.value, session, cited, facts.value.moment)).toEqual({
            kind: 'read',
            value: [],
          })
          expect(await goals.track(agent, { session, patch: { notes: ['x'] } })).toEqual({
            kind: 'refused',
            reason: { kind: 'state', reason: 'no-live-goal' },
          })
          expect(await sessions.facts(text.value, 'f'.repeat(64))).toEqual({
            kind: 'read',
            value: null,
          })
          const wake = {
            kind: 'start',
            request: 'start/1/1',
            session,
            rendered: 'THE-GOAL',
          } as const
          expect(await sessions.wake(text.value, wake)).toBe('sent')
          expect(await sessions.wake(text.value, wake)).toBe('sent')
          const entries = await pollUntil(
            'the run the reminder opened',
            () => historyOf(tree, session),
            found => terminals(found) === 2,
          )
          const reminders = entries
            .filter(entry => entry.kind === 'message.system_reminder')
            .map(entry => textsOf(entry.payload).join('\n'))
            .filter(body => body.includes('THE-GOAL'))
          expect(reminders).toHaveLength(1)
          expect(reminders[0]).toContain('A goal was set for this session')
        },
      )
    },
  )
})
