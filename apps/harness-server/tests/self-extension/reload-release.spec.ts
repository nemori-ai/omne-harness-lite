// @module-tag slow
// Starts the release tree: a person reloads an idle session, by the protocol and by /reload; the next run uses the new version.
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { agents, cliOk, extensions, files, plan } from '../support/planned-model.ts'
import { history, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import { inWorkspace, otherTenant, recordingModel, write } from './support.ts'

const definition = (mark: string) => `---
name: noter
summary: Says back what it is told.
references:
  - { category: tool, name: Files, resident: true }
---
You say back what you are told. ${mark}
`

const publish = (id: string) =>
  extensions('publish', { id, category: 'AgentDefinition', name: 'noter', dir: 'work/noter' })
const replace = (path: string, text: string) => files('write', { path, text, mode: 'replace' })

type Ask = Parameters<Parameters<typeof inWorkspace>[0]>[0]
type Entry = Awaited<ReturnType<typeof history>>[number]
const of = (entries: readonly Entry[], kind: string) => entries.filter(item => item.kind === kind)
const adoptionOf = (item: Entry | undefined) =>
  (item?.payload as { adoption?: { digest?: string } } | undefined)?.adoption?.digest

async function noterSession(ask: Ask, tree: ReleaseTree): Promise<string> {
  await ask([write('work/noter/AGENT.md', definition('MARK-ONE'))], [publish('op-1')])
  await ask([agents('dispatch', { mode: 'delegate', agent: 'noter', instruction: plan() })])
  const listed = await pollUntil(
    'the session of the noter to be listed',
    async () => (await cliOk(tree, ['list-sessions', '--definition', 'noter'])).body,
    body => JSON.stringify(body).includes('"definition":"noter"'),
  )
  const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
  await pollUntil(
    'the first run of the noter to end',
    () => history(tree.port, tree.home, child),
    seen => of(seen, 'run.terminal').length >= 1,
  )
  return child
}

const ownerOf = (tree: ReleaseTree): string => {
  const owner = tenantCodec.encode(tree.registrar().tenant)
  if (!owner.ok) throw new Error('the tenant of the tree has no text')
  return owner.value
}
const reload = (tree: ReleaseTree, session: string, controlId: string) =>
  tree.cli([
    'reload-session',
    '--session',
    session,
    '--control-id',
    controlId,
    '--tenant',
    ownerOf(tree),
  ])
const say = (tree: ReleaseTree, session: string, text: string) =>
  cliOk(tree, ['send-input', '--session', session, '--text', text, '--tenant', ownerOf(tree)])

describe('a person reloads an idle session, on the release tree', () => {
  it(
    'by the protocol: the next run uses the new version, the same again is up to date, and another tenant is answered as for no session',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const child = await noterSession(ask, tree)
          const first = of(await history(tree.port, tree.home, child), 'run.started')
          await ask([replace('work/noter/AGENT.md', definition('MARK-TWO'))], [publish('op-2')])
          const reloaded = await reload(tree, child, 'reload-1')
          expect(JSON.parse(reloaded.stdout)).toMatchObject({
            outcome: 'succeeded',
            body: { kind: 'adopted' },
          })
          expect(of(await history(tree.port, tree.home, child), 'run.started')).toHaveLength(1)
          const again = await reload(tree, child, 'reload-2')
          expect(JSON.parse(again.stdout)).toMatchObject({
            outcome: 'succeeded',
            body: { kind: 'no-change' },
          })

          const other = await otherTenant(tree)
          const asOther = ['--control-id', 'x', '--tenant', ownerOf(tree)]
          const theirs = await other.cli(['reload-session', '--session', child, ...asOther])
          const nowhere = await other.cli([
            'reload-session',
            '--session',
            `${child.slice(0, -1)}${child.endsWith('a') ? 'b' : 'a'}`,
            ...asOther,
          ])
          const answerOf = (text: string) => {
            const { outcome, body } = JSON.parse(text) as { outcome: string; body: unknown }
            return { outcome, body }
          }
          expect(answerOf(theirs.stdout).outcome).not.toBe('succeeded')
          expect(answerOf(theirs.stdout)).toEqual(answerOf(nowhere.stdout))

          await say(tree, child, plan())
          const after = await pollUntil(
            'the second run of the noter to end',
            () => history(tree.port, tree.home, child),
            seen => of(seen, 'run.terminal').length >= 2,
          )
          const started = of(after, 'run.started')
          expect(adoptionOf(started[1])).not.toBe(adoptionOf(first[0]))
          const last = model.systems.at(-1) ?? ''
          expect(last).toContain('MARK-TWO')
        },
        { script: model.script },
      )
    },
  )

  it(
    'by /reload: the command is recorded, no run starts for it, and the next run uses the new version',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const model = recordingModel()
      await inWorkspace(
        async (ask, tree) => {
          const child = await noterSession(ask, tree)
          await ask([replace('work/noter/AGENT.md', definition('MARK-TWO'))], [publish('op-2')])
          const requests = model.bodies.length
          await say(tree, child, '/reload')
          const recorded = await pollUntil(
            'the reload command to be recorded',
            () => history(tree.port, tree.home, child),
            seen => of(seen, 'session.command-recorded').length >= 1,
          )
          expect(of(recorded, 'session.command-recorded')[0]?.payload).toMatchObject({
            name: 'omne-official:reload',
          })
          expect(of(recorded, 'run.started')).toHaveLength(1)
          expect(model.bodies.length).toBe(requests)
          await say(tree, child, plan())
          await pollUntil(
            'the second run of the noter to end',
            () => history(tree.port, tree.home, child),
            seen => of(seen, 'run.terminal').length >= 2,
          )
          expect(model.systems.at(-1) ?? '').toContain('MARK-TWO')
        },
        { script: model.script, extraHistoryKinds: ['session.command-recorded'] },
      )
    },
  )
})
