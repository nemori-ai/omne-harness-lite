import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OFFICIAL_SKILLS } from '@omne-harness/plugin-host-local'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsByRequest, toolResults } from '../../support/release-tree.ts'
import { lastMessageOf } from '../../support/tools-flow.ts'
import { endedRuns, sendInput } from '../authorization/release-flow-support.ts'

const directory = OFFICIAL_SKILLS.find(skill => skill.name === 'extending-the-app')?.directory ?? ''
const NOTES_PAGE = join(directory, 'examples', 'notes-page')

const asked = (body: string): boolean => {
  const last = lastMessageOf(body)
  return last?.role === 'user' && JSON.stringify(last.content).includes('tree')
}

const script = toolCallsByRequest(body =>
  asked(body)
    ? [
        {
          id: `c_tree_${String(Date.now())}`,
          tool: 'OmneExtensionPoints',
          arguments: JSON.stringify({ command: 'tree', params: { side: 'server' } }),
        },
      ]
    : [],
)

describe('removing a plugin (C15)', () => {
  it(
    'brings the extension tree, what the availability serves and what scoped answers back to what they were before it was installed',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('hello')
        let runs = 1
        await endedRuns(tree, session, runs)
        const extensionTree = async (): Promise<string> => {
          await sendInput(tree, session, 'tree')
          runs += 1
          return toolResults(await endedRuns(tree, session, runs)).at(-1) ?? ''
        }
        const credentials = savedCredentials(tree.home)
        const access = createClient(
          accessProtocol,
          protocolTransport(originOf(tree.port), credentials),
        )
        const served = async () => {
          const stop = new AbortController()
          const frames = access.observe.availability({}, { signal: stop.signal })
          const first = await frames.next()
          stop.abort()
          await frames.return({ kind: 'aborted' })
          if (first.done === true || first.value.kind !== 'snapshot') throw new Error('no snapshot')
          const { revision: _revision, scoped: _scoped, ...frame } = first.value
          return frame
        }
        const scoped = async () => {
          const answer = await access.scoped({})
          if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
          return answer.body.protocols.map(protocol => `${protocol.name}/v${protocol.major}`)
        }
        // The last line counts the changes of the registry, as the revision of the availability does.
        const read = async () => ({
          tree: (await extensionTree()).replace(/\ntree rev \S+$/u, ''),
          availability: await served(),
          scoped: await scoped(),
        })
        const until = async (test: (names: readonly string[]) => boolean) => {
          for (let turn = 0; turn < 50; turn += 1) {
            if (test(await scoped())) return
            await new Promise(resolve => setTimeout(resolve, 200))
          }
          throw new Error('scoped did not change')
        }

        const before = await read()
        const files = Object.fromEntries(
          readdirSync(NOTES_PAGE).map(name => [name, readFileSync(join(NOTES_PAGE, name), 'utf8')]),
        )
        const tenant = tenantOf(savedTenant(tree.home))
        const made = await uploadPlugin(tree.clients.assets, tenant, 'notes-page', files)
        expect(made.outcome, JSON.stringify(made)).toBe('succeeded')
        await until(names => names.includes('notes/v1'))
        const during = await read()
        expect(during.scoped).toEqual(['notes/v1'])
        expect(during.tree).not.toBe(before.tree)

        const removed = await tree.cli(['asset', 'remove', 'plugin:notes-page', '--yes'])
        expect(removed.status, removed.stderr).toBe(0)
        await until(names => names.length === 0)
        expect(await read()).toEqual(before)
      })
      expect(exitCode).toBe(0)
    },
  )
})
