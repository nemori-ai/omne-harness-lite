// @module-tag slow
// Starts the release service three times on one state and drives a scripted model through Skills and Shell.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  historyOf,
  onReleaseTreeRuns,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
  type ScriptedToolCall,
} from '../support/release-tree.ts'
import { publishOffline } from './publish-offline.ts'
import { SAMPLE_LINE } from './support.ts'

const skills = (command: string, params: object): string => JSON.stringify({ command, params })

type Turn = Readonly<{ user: string; results: readonly string[] }>

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part =>
      typeof part === 'object' && part !== null ? (part as { text?: unknown }).text : '',
    )
    .filter((text): text is string => typeof text === 'string')
    .join('')
}

function turnOf(body: string): Turn {
  const { messages } = JSON.parse(body) as { messages: { role: string; content: unknown }[] }
  const last = messages.findLastIndex(message => message.role === 'user')
  return {
    user: contentText(messages[last]?.content),
    results: messages
      .slice(last + 1)
      .filter(message => message.role === 'tool')
      .map(message => contentText(message.content)),
  }
}

function step({ user, results }: Turn): readonly ScriptedToolCall[] {
  if (user.includes('weekly')) {
    if (results.length === 0)
      return [
        { id: 'call_search', tool: 'Skills', arguments: skills('search', { query: '帮我出周报' }) },
      ]
    if (results.length === 1)
      return [
        { id: 'call_read', tool: 'Skills', arguments: skills('read', { skill: 'weekly-report' }) },
      ]
    const directory = /^directory=(.+)$/mu.exec(results[1] ?? '')?.[1]
    if (results.length === 2 && directory !== undefined)
      return [
        {
          id: 'call_run',
          tool: 'Shell',
          arguments: JSON.stringify({
            command: 'execute',
            intent: 'run the collector of the weekly-report Skill',
            params: { script: `${process.execPath} ${join(directory, 'scripts', 'collect.mjs')}` },
          }),
        },
      ]
    return []
  }
  if (user.includes('again') && results.length === 0)
    return [
      { id: 'call_again', tool: 'Skills', arguments: skills('search', { query: 'release notes' }) },
    ]
  return []
}

const runsEnded = (count: number) => (entries: readonly { kind: string }[]) =>
  entries.filter(entry => entry.kind === 'run.terminal').length === count

describe('Skills in a real coding session', () => {
  it(
    'searches, reads with the directory, runs the script with Shell, and finds a Skill published before the next Run of the session',
    { timeout: 600_000 },
    async () => {
      let tenant: string | undefined
      let session = ''
      const declared = new Set<string>()
      const ended = (tree: ReleaseTree, at: string, count: number) =>
        pollUntil(
          `Run ${String(count)} of ${at} to end`,
          () => historyOf(tree, at),
          runsEnded(count),
        )
      const exits = await onReleaseTreeRuns(
        {
          script: toolCallsByRequest(body => {
            const { tools } = JSON.parse(body) as { tools?: { function: { name: string } }[] }
            for (const tool of tools ?? []) declared.add(tool.function.name)
            return step(turnOf(body))
          }),
          async beforeRun(run, storageRoot) {
            if (run === 0 || tenant === undefined) return
            if (run === 1) await publishOffline(storageRoot, tenant, 'weekly-report')
            if (run === 2)
              await publishOffline(
                storageRoot,
                tenant,
                'release-notes',
                'Writes the release notes of a version.',
              )
          },
        },
        [
          async tree => {
            const key = tenantCodec.encode(tree.registrar().tenant)
            if (!key.ok) throw new Error('tenant')
            tenant = key.value
            await ended(tree, await tree.startSession('hello'), 1)
          },
          async tree => {
            session = await tree.startSession('write the weekly report')
            const history = await ended(tree, session, 1)
            const [found, read, ran] = toolResults(history)
            expect(found).toContain('weekly-report')
            expect(found).not.toContain('release-notes')
            expect(read).toContain('Run the collector with Shell')
            expect(read).toMatch(/^directory=\//mu)
            expect(ran).toContain(SAMPLE_LINE)
            expect(history.find(entry => entry.kind === 'run.terminal')?.payload).toMatchObject({
              terminal: { outcome: 'completed' },
            })
          },
          async tree => {
            const sent = await tree.cli([
              'send-input',
              '--session',
              session,
              '--text',
              'search again',
            ])
            expect(sent.status, sent.stderr).toBe(0)
            expect(toolResults(await ended(tree, session, 2))[3]).toContain('release-notes')
          },
        ],
      )
      expect(exits).toEqual([0, 0, 0])
      expect([...declared].sort()).toEqual([
        'Ask',
        'BkgToolCalls',
        'Calendar',
        'Files',
        'Notifications',
        'Schedules',
        'Sessions',
        'Shell',
        'Skills',
        'SwitchWorkspace',
        'TodoItems',
        'Tools',
        'Web',
      ])
    },
  )
})
