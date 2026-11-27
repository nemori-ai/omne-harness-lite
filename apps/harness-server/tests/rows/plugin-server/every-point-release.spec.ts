import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { tenantOf } from '../../support/protocol-clients.ts'
import {
  onReleaseTree,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { lastMessageOf } from '../../support/tools-flow.ts'
import { endedRuns, sendInput } from '../authorization/release-flow-support.ts'

/** What the person says, read by the scripted model: each word after the verb is one call of a tool. */
function said(body: string): string | undefined {
  const last = lastMessageOf(body)
  if (last?.role !== 'user') return undefined
  const content = last.content
  return typeof content === 'string'
    ? content
    : (content as { text?: string }[]).map(part => part.text ?? '').join('')
}

let calls = 0
const call = (tool: string, command: string, params: object) => ({
  id: `c_${String((calls += 1))}`,
  tool,
  arguments: JSON.stringify({ command, params }),
})

const script = toolCallsByRequest(body => {
  const [verb, ...names] = (said(body) ?? '').split(' ')
  if (verb === 'tree') return [call('OmneExtensionPoints', 'tree', { side: 'server' })]
  if (verb === 'show') return names.map(name => call('OmneExtensionPoints', 'show', { name }))
  if (verb === 'plugins')
    return names.map(name => call('OmneExtensions', 'show', { category: 'plugin', name }))
  return []
})

/** Says one thing in the session and answers what each tool call of that run said, in order. */
async function asker(tree: ReleaseTree, session: string) {
  let runs = 1
  await endedRuns(tree, session, runs)
  return async (text: string): Promise<string[]> => {
    const asked = text.split(' ').length - 1
    await sendInput(tree, session, text)
    runs += 1
    return toolResults(await endedRuns(tree, session, runs)).slice(-Math.max(asked, 1))
  }
}

/** One member of a plugin and its files, from a member to copy: the member's line, then each file under a line naming it. */
function copied(example: readonly string[]): { member: object; files: Record<string, string> } {
  const [first = '{}', ...rest] = example
  const files: Record<string, string> = {}
  let at: string | undefined
  for (const line of rest) {
    const named = /^(\S+\.js):$/u.exec(line)
    if (named !== null) at = named[1] ?? ''
    else if (at !== undefined) files[at] = `${files[at] ?? ''}${line}\n`
  }
  return { member: JSON.parse(first) as object, files }
}

const manifest = (name: string, member: object) =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'One member on one point.',
    server: { members: [member] },
  })
const probeOf = (point: string) => `probe-${point.replaceAll('.', '-')}`
const copyOf = (point: string) => `copy-${point.replaceAll('.', '-')}`

describe('every point of the server tree of the release (PL-I27, PL-I29)', () => {
  it(
    'is closed with the reason the loader gives, or a category that says what it takes, or open with a member to copy that is placed and in effect for the tenant',
    { tags: ['slow'], timeout: 600_000 },
    async () => {
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('hello')
        const ask = await asker(tree, session)
        const tenant = tenantOf(savedTenant(tree.home))
        const [listed = ''] = await ask('tree')
        const points = [
          ...listed.matchAll(/^\s+([a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*)\s+point\s/gmu),
        ].map(([, name]) => name ?? '')
        expect(points.length).toBeGreaterThan(10)
        const shown = await ask(`show ${points.join(' ')}`)
        const verdicts = new Map<string, { open: boolean; said: string; example: string[] }>()
        for (const [at, point] of points.entries()) {
          const text = shown[at] ?? ''
          const verdict = /^plugins: (open|closed)\. (.*)$/mu.exec(text)
          expect(verdict, `${point} says whether plugins may put there:\n${text}`).not.toBeNull()
          const lines = text.split('\n')
          const from = lines.indexOf('a member, to copy:')
          const after = from < 0 ? [] : lines.slice(from + 1)
          const end = after.findIndex(line => !line.startsWith('  '))
          const example = after.slice(0, end < 0 ? after.length : end).map(line => line.slice(2))
          verdicts.set(point, { open: verdict?.[1] === 'open', said: verdict?.[2] ?? '', example })
        }
        // A port says how a plugin asks for it and what each of its methods takes and answers.
        const ports = shown[points.indexOf('plugin.ports')] ?? ''
        expect(ports).toContain('under needs on its server side')
        expect(ports).toMatch(/^  notifications\n    send   takes: .+\n\s+answers: .+$/mu)
        // A point that takes code says what the code gives back and what it is called with.
        const code = shown[points.indexOf('access.protocols')] ?? ''
        expect(code).toMatch(/^your code gives back: a protocol written as data and its handlers/mu)
        expect(code).toContain('your code is called with one object: ports')
        console.log(
          `server points:\n${[...verdicts].map(([point, v]) => `  ${point}: ${v.open ? 'open' : 'closed'} ${v.said}`).join('\n')}`,
        )

        // A closed point refuses a member, for the reason the tool gave: one judgment, read in two places.
        // A category refuses it when the plugin is published; any other point when the server loads it.
        const closed: string[] = []
        for (const point of points.filter(p => verdicts.get(p)?.open === false)) {
          const made = await uploadPlugin(tree.clients.assets, tenant, probeOf(point), {
            'plugin.json': manifest(probeOf(point), { point, key: 'probe', data: {} }),
          })
          const said = verdicts.get(point)?.said ?? ''
          if (made.outcome === 'invalid')
            expect(JSON.stringify(made), point).toContain(`(${point}, probe): ${said}`)
          else {
            expect(made.outcome, `${point}: ${JSON.stringify(made)}`).toBe('succeeded')
            closed.push(point)
          }
        }
        // A category is the owner of what one of it holds: its member to copy points at the category's own help.
        const isCategory = (point: string) =>
          verdicts.get(point)?.example[1]?.includes('help with name publish and category') === true
        for (const point of points.filter(p => verdicts.get(p)?.open === true && isCategory(p))) {
          expect(verdicts.get(point)?.said, point).toMatch(/^A member gives (a directory|data)\.$/u)
          expect(verdicts.get(point)?.example[0], point).toMatch(
            new RegExp(`^\\{"point":"${point}","key":"<name>","(directory|data)":`, 'u'),
          )
        }
        // Any other open point takes its member to copy as it is written, for the tenant.
        const copies = points.filter(p => verdicts.get(p)?.open === true && !isCategory(p))
        for (const point of copies)
          expect(verdicts.get(point)?.example.length, point).toBeGreaterThan(0)
        for (const point of copies) {
          const { member, files } = copied(verdicts.get(point)?.example ?? [])
          const made = await uploadPlugin(tree.clients.assets, tenant, copyOf(point), {
            'plugin.json': manifest(copyOf(point), member),
            ...files,
          })
          expect(made.outcome, `${point}: ${JSON.stringify(made)}`).toBe('succeeded')
        }

        let refused: string[] = []
        for (let turn = 0; turn < 8; turn += 1) {
          refused = await ask(`plugins ${closed.map(probeOf).join(' ')}`)
          if (refused.every(text => text.includes('the server could not load it'))) break
        }
        for (const [at, point] of closed.entries())
          expect(refused[at], point).toContain(
            `the server could not load it: member 1 (${point} probe): ${verdicts.get(point)?.said}`,
          )

        let now: string[] = []
        for (let turn = 0; turn < 8; turn += 1) {
          now = await ask(`show ${copies.join(' ')}`)
          if (copies.every((point, at) => now[at]?.includes(`plugin:${copyOf(point)}@`))) break
        }
        const told = await ask(`plugins ${copies.map(copyOf).join(' ')}`)
        for (const [at, point] of copies.entries())
          expect(
            now[at],
            `${point}: the member to copy is placed and in effect for the tenant\n${told[at]}`,
          ).toMatch(new RegExp(`plugin:${copyOf(point)}@[^\\n]*\\[in effect\\]`, 'u'))
      })
      expect(exitCode).toBe(0)
    },
  )
})
