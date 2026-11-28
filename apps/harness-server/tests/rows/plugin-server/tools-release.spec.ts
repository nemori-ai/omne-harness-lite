// @module-tag slow
// The tools a tenant's plugin brings, on the release tree (C21, C22, TL-76, TL-77).
import { dirname, join } from 'node:path'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  toolEntrySourcesKey,
  type ToolEntrySourcesService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { entrySourceScope } from '../../../src/entry/tool-entry-sources.ts'
import { bodyOf, runOmne, savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import { originOf, tenantOf } from '../../support/protocol-clients.ts'
import {
  history,
  onReleaseTree,
  pollUntil,
  toolCallsByRequest,
  toolResults,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { lastMessageOf, lastResult, recoveryOf, toolsCall } from '../../support/tools-flow.ts'
import {
  answerCard,
  endedRuns,
  pendingCard,
  sendInput,
} from '../authorization/release-flow-support.ts'

const manifest = (name: string, key: string) =>
  JSON.stringify({
    schema: 1,
    name,
    summary: 'Tells the weather.',
    server: {
      members: [{ point: 'tool.entry-sources', key, module: 'tools.js', export: 'tools' }],
    },
  })

const TOOLS = `export function tools() {
  return {
    tools: {
      forecast: {
        summary: 'Tells the weather of a city.',
        params: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        effect: 'read',
        run: async input => ({ city: input.city, sky: 'sunny' }),
      },
    },
  }
}
`

// Each user message asks for one call of Tools; a pending answer is followed by its recovery call.
const script = toolCallsByRequest(body => {
  const last = lastMessageOf(body)
  const recovery = recoveryOf(last)
  if (recovery !== undefined)
    return [toolsCall(`read_${String(Date.now())}`, recovery.command, recovery.params)]
  if (last?.role !== 'user') return []
  const text = JSON.stringify(last.content)
  const city = /call ([a-z]+)/u.exec(text)?.[1]
  if (city !== undefined)
    return [
      toolsCall(`call_${city}`, 'execute', {
        name: 'weather__forecast',
        command: 'run',
        arguments: { city },
      }),
    ]
  if (text.includes('search weather'))
    return [
      toolsCall(`search_${String(Date.now())}`, 'search', {
        query: 'weather',
        after: null,
        limit: 10,
      }),
    ]
  return []
})

type Sources = ToolEntrySourcesService<unknown, ContentBlock>
const prefixesFor = (tree: ReleaseTree, tenant: TenantId) =>
  (tree.scope.get(toolEntrySourcesKey) as Sources)
    .sources(entrySourceScope({ principal: null, tenant }))
    .map(source => source.prefix)
    .toSorted()

/** Another person with a tenant of their own, signed in through the command line. */
async function another(tree: ReleaseTree, name: string) {
  const base = dirname(tree.home)
  const home = join(base, name)
  const server = originOf(tree.port)
  const cli = (args: readonly string[]) => runOmne({ args, home, server, cwd: base })
  for (const command of ['register', 'login']) {
    const args = [command, '--login-identifier', name]
    const done = await runOmne({ args, home, server, cwd: base, credential: `${name}-pw-3b7e90d1` })
    expect(done.status, done.stderr).toBe(0)
  }
  const tenant = tenantOf(savedTenant(home))
  const owner = tenantCodec.encode(tenant)
  if (!owner.ok) throw new Error('the tenant has no text')
  const results = async (session: string, runs: number) => {
    const entries = await pollUntil(
      `${name}'s Run ${String(runs)} to end`,
      () => history(tree.port, home, session),
      value => value.filter(entry => entry.kind === 'run.terminal').length === runs,
    )
    return toolResults(entries)
  }
  const say = async (session: string, text: string) => {
    const sent = await cli([
      'send-input',
      '--session',
      session,
      '--tenant',
      owner.value,
      '--text',
      text,
    ])
    expect(sent.status, sent.stderr).toBe(0)
  }
  const created = await cli(['create-session', '--definition', 'coding'])
  expect(created.status, created.stderr).toBe(0)
  const session = String(bodyOf(created)['session'])
  return { tenant, session, say, results }
}

const ownerOf = (name: string) => ({ kind: 'asset', category: 'plugin', name }) as const

describe("the tools a tenant's plugin brings, on the release tree", () => {
  it(
    'only its tenant finds and calls them, asked first by the gate the form fixes; prohibited they are refused without asking; a plugin cannot take the prefix of a source of the deployment',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script, permission: 'auto_permission' },
        async tree => {
          const assets = tree.clients.assets
          const alice = tenantOf(savedTenant(tree.home))
          const session = await tree.startSession('hello')
          await endedRuns(tree, session, 1)
          const frank = await another(tree, 'frank')
          const shared = prefixesFor(tree, alice)

          const made = await uploadPlugin(assets, alice, 'weather', {
            'plugin.json': manifest('weather', 'weather__'),
            'tools.js': TOOLS,
          })
          if (made.outcome !== 'succeeded') throw new Error(JSON.stringify(made))
          await pollUntil(
            'the tools of the plugin to be a source of its tenant',
            () => Promise.resolve(prefixesFor(tree, alice)),
            prefixes => prefixes.includes('weather__'),
          )
          expect(prefixesFor(tree, frank.tenant)).toEqual(shared)

          await sendInput(tree, session, 'search weather')
          const found = JSON.parse(await lastResult(tree, session, 2)) as {
            tools: { name: string; resident: boolean }[]
          }
          expect(found.tools.find(tool => tool.name === 'weather__forecast')).toMatchObject({
            resident: false,
          })

          await sendInput(tree, session, 'call oslo')
          const card = await pendingCard(tree, session, 'the first call of the forecast')
          expect(JSON.stringify(card.question)).toContain('weather__forecast')
          await answerCard(tree, card, ['--option', 'allow-once'], 'reply-oslo')
          const done = await lastResult(tree, session, 3)
          expect(done).toContain('done weather__forecast')
          expect(done).toContain('{"city":"oslo","sky":"sunny"}')

          await frank.say(frank.session, 'search weather')
          const searched = (await frank.results(frank.session, 1)).join('\n')
          expect(searched).toContain('"tools":[')
          expect(searched).not.toContain('weather__forecast')
          await frank.say(frank.session, 'call bergen')
          const called = (await frank.results(frank.session, 2)).join('\n')
          expect(called.length).toBeGreaterThan(searched.length)
          expect(called).not.toContain('done weather__forecast')

          const described = await assets['describe-setting']({
            tenant: alice,
            owner: ownerOf('weather'),
            item: 'invoke',
          })
          if (described.outcome !== 'succeeded') throw new Error(JSON.stringify(described))
          expect(described.body.item).toMatchObject({ kind: 'permission' })
          const denied = await assets['set-setting']({
            tenant: alice,
            owner: ownerOf('weather'),
            item: 'invoke',
            operation: 'weather-deny',
            expectedRevision: described.body.item.revision,
            value: { kind: 'permission', pick: 'deny' },
          })
          expect(denied).toMatchObject({ outcome: 'succeeded' })
          await sendInput(tree, session, 'call tromso')
          expect(await lastResult(tree, session, 4)).not.toContain('done weather__forecast')
          expect(await tree.cards({ sessionRef: session, states: ['pending'] })).toEqual([])

          const posing = await uploadPlugin(assets, alice, 'posing', {
            'plugin.json': manifest('posing', 'mcp__'),
            'tools.js': TOOLS,
          })
          if (posing.outcome !== 'succeeded') throw new Error(JSON.stringify(posing))
          const official = (tree.scope.get(toolEntrySourcesKey) as Sources)
            .sources([])
            .find(source => source.prefix === 'mcp__')
          await new Promise(resolve => setTimeout(resolve, 2000))
          const seen = (tree.scope.get(toolEntrySourcesKey) as Sources)
            .sources(entrySourceScope({ principal: null, tenant: alice }))
            .filter(source => source.prefix === 'mcp__')
          expect(official).toBeDefined()
          expect(seen).toEqual([official])
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
