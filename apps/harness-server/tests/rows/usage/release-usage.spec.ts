// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant as composeTenant,
} from '@omne-harness/legal-identity'
import type { UsageQuery } from '@omne-harness/usage-contract'
import { usageKey, type UsageService } from '@omne-harness/usage-cordis-contract/cordis'
import {
  historyOf,
  onReleaseTree,
  onReleaseTreeRuns,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

const START = Date.now()
const RANGE = {
  from: new Date(START - 3_600_000).toISOString(),
  to: new Date(START + 7_200_000).toISOString(),
}
const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

function query(
  tree: ReleaseTree,
  scope: UsageQuery['scope'],
  as: Readonly<{ tenant: unknown; principal: unknown }> = tree.registrar(),
) {
  const usage = tree.scope.get(usageKey) as UsageService<unknown> | undefined
  if (usage === undefined) throw new Error('the usage service is not in the tree')
  return usage.query({
    principal: as.principal,
    tenant: as.tenant as never,
    scope,
    range: RANGE,
    zone: 'UTC',
    bucket: 'none',
    groupBy: ['source', 'purpose'],
  })
}

const ended = (tree: ReleaseTree, session: string) =>
  pollUntil(
    'the Run to end',
    () => historyOf(tree, session),
    entries => entries.some(entry => entry.kind === 'run.terminal'),
  )

function unitsByGroup(answer: Awaited<ReturnType<typeof query>>) {
  if (!('ok' in answer)) throw new Error(`the usage query failed: ${JSON.stringify(answer)}`)
  return Object.fromEntries(answer.ok.groups.map(cell => [cell.key.join('/'), cell.measures.units]))
}

describe('usage over the release tree', () => {
  it(
    'counts the summary call of a compacted session in the session, with the main and the tool calls (C20)',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const main: string[] = []
      const summaries: string[] = []
      let tools = 0
      await onReleaseTree(
        {
          permission: 'bypass-permissions',
          collaboration: 'co-work',
          compactionTriggerPercent: '20',
          script: ({ body }) => {
            const request = JSON.parse(body) as { model: string }
            const serving = { model: request.model, provider: 'OpenAI' }
            if (body.includes('Summarize the conversation so far for a later request')) {
              summaries.push(body)
              return {
                status: 200,
                contentType: 'text/event-stream',
                body: sse([
                  { ...serving, choices: [{ delta: { content: 'summary: finish the task.' } }] },
                  { choices: [{ delta: {}, finish_reason: 'stop' }] },
                ]),
              }
            }
            main.push(body)
            if (main.length > 25)
              throw new Error('the long conversation did not trigger compaction')
            const continuing = summaries.length === 0
            const content = continuing ? `STEP ${main.length}: ` + 'memo '.repeat(12_000) : 'done'
            const events: unknown[] = []
            for (let start = 0; start < content.length; start += 50_000)
              events.push({
                ...serving,
                choices: [{ delta: { content: content.slice(start, start + 50_000) } }],
              })
            if (continuing) {
              tools += 1
              events.push({
                ...serving,
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: `call_${main.length}`,
                          type: 'function',
                          function: {
                            name: 'Ask',
                            arguments: JSON.stringify({ command: 'unknown-command', params: {} }),
                          },
                        },
                      ],
                    },
                  },
                ],
              })
            }
            events.push({
              choices: [{ delta: {}, finish_reason: continuing ? 'tool_calls' : 'stop' }],
            })
            return { status: 200, contentType: 'text/event-stream', body: sse(events) }
          },
        },
        async tree => {
          const session = await tree.startSession('Investigate and finish the original task.')
          const history = await ended(tree, session)
          expect(history.filter(entry => entry.kind === 'message.compaction')).toHaveLength(1)
          expect(summaries).toHaveLength(1)
          const units = await pollUntil(
            'the usage of the ended Run',
            async () => unitsByGroup(await query(tree, { kind: 'session', session })),
            seen => seen['model/summary'] === 1 && seen['model/main'] === main.length,
          )
          expect(units).toEqual({
            'model/main': main.length,
            'model/summary': 1,
            'tool/action': tools,
          })
          const tenant = unitsByGroup(await query(tree, { kind: 'tenant' }))
          expect(tenant['model/summary']).toBe(1)
        },
      )
    },
  )

  it(
    'reads nothing of one tenant for another, and answers an unknown and a foreign session alike (C21)',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const org = organizationCodec.parse(`org_${'7'.repeat(26)}`)
      const acc = accountCodec.parse(`acc_${'8'.repeat(26)}`)
      if (!org.ok || !acc.ok) throw new Error('fixture tenant')
      const other = composeTenant(org.value, acc.value)
      await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const session = await tree.startSession('hello')
        await ended(tree, session)
        const own = await pollUntil(
          'the usage of the session',
          async () => unitsByGroup(await query(tree, { kind: 'tenant' })),
          seen => (seen['model/main'] ?? 0) >= 1,
        )
        expect(own['model/main']).toBeGreaterThanOrEqual(1)
        const { principal } = tree.registrar()
        const across = await query(tree, { kind: 'tenant' }, { tenant: other, principal })
        expect(across, JSON.stringify(across)).toMatchObject({ failure: { kind: 'denied' } })
        const foreign = await query(
          tree,
          { kind: 'session', session },
          { tenant: other, principal },
        )
        const unknown = await query(tree, { kind: 'session', session: 'ses_no_such_session' })
        expect(foreign).toEqual({ failure: { kind: 'not-found', what: 'session' } })
        expect(unknown).toEqual(foreign)
      })
    },
  )

  it(
    'leaves the core as it was without the usage rows, and gives the same answer when they are back (C26)',
    { tags: ['slow'], timeout: 400_000 },
    async () => {
      let first: unknown = null
      let session = ''
      const exits = await onReleaseTreeRuns(
        {
          script: toolCallsThenText(() => []),
          withoutRows: run => (run === 1 ? ['usage', 'usage-adapters'] : []),
        },
        [
          async tree => {
            session = await tree.startSession('hello')
            await ended(tree, session)
            first = await pollUntil(
              'the usage of the session',
              () => query(tree, { kind: 'session', session }),
              answer => 'ok' in answer && answer.ok.total.units >= 1,
            )
          },
          async tree => {
            expect(tree.scope.get(usageKey)).toBeUndefined()
            const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
            expect(ids).not.toContain('usage')
            expect(ids).not.toContain('usage-adapters')
            const history = await ended(tree, await tree.startSession('hello again'))
            expect(JSON.stringify(history.find(entry => entry.kind === 'run.terminal'))).toContain(
              '"outcome":"completed"',
            )
          },
          async tree => {
            expect(await query(tree, { kind: 'session', session })).toEqual(first)
          },
        ],
      )
      expect(exits).toEqual([0, 0, 0])
    },
  )
})
