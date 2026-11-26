// @module-tag slow
// Starts the release tree: a person reloads an idle session, by the protocol and by /reload; the next run uses the new version.
import { describe, expect, it } from 'vitest'
import { savedTenant } from '../r9/support.ts'
import { plan } from '../support/planned-model.ts'
import { history, pollUntil } from '../support/release-tree.ts'
import {
  adoptionOf,
  definition,
  noterSession,
  of,
  ownerOf,
  publish,
  published,
  reload,
  replace,
  say,
} from './noter.ts'
import { inWorkspace, otherTenant, recordingModel } from './support.ts'

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
          await published(model.bodies, 'op-2')
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
          // Acting in a tenant of their own, naming this session reads as naming none.
          const ownTenant = ['--control-id', 'y', '--tenant', savedTenant(other.home)]
          const named = await other.cli(['reload-session', '--session', child, ...ownTenant])
          const unknown = await other.cli([
            'reload-session',
            '--session',
            `${child.slice(0, -1)}${child.endsWith('a') ? 'b' : 'a'}`,
            ...ownTenant,
          ])
          expect(answerOf(named.stdout).outcome).not.toBe('succeeded')
          expect(answerOf(named.stdout)).toEqual(answerOf(unknown.stdout))

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
          await published(model.bodies, 'op-2')
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
