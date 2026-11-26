import { describe, expect, it } from 'vitest'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import { onReleaseTree, type ReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'

type Candidates = Readonly<{
  outcome: string
  body?: { candidates: readonly Readonly<Record<string, unknown>>[] }
}>

function foreignTenant(tenant: string): string {
  const parsed = JSON.parse(tenant) as { organization: string; account: string }
  const last = parsed.account.at(-1) === 'a' ? 'b' : 'a'
  return JSON.stringify({ ...parsed, account: `${parsed.account.slice(0, -1)}${last}` })
}

async function routes(tree: ReleaseTree): Promise<readonly string[]> {
  const ran = await tree.cli(['list-models'])
  const printed = JSON.parse(ran.stdout || '{}') as { body?: { models?: { route: string }[] } }
  return (printed.body?.models ?? []).map(model => model.route)
}

const read = (tree: ReleaseTree, body: Readonly<Record<string, unknown>>) =>
  tree.clients.slashCommand['read-candidates'](body as never) as Promise<Candidates>

describe('the candidates of an argument, on the release tree', () => {
  it(
    'are worked out for the one who asks: the models the session can choose, the one in use marked, and the three modes; another tenant is answered as a session that is not there',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const session = sessionRef(await settledSession(tree, 'hello'))
        const tenant = tenantOf(savedTenant(tree.home))
        const asked = (command: string, at = { tenant, session }) =>
          read(tree, { ...at, command: `omne-official:${command}`, param: 0 })

        const models = await asked('model')
        expect(models.outcome).toBe('succeeded')
        const offered = models.body?.candidates ?? []
        expect(offered.map(candidate => candidate['value'])).toEqual(await routes(tree))
        const selection = await tree.clients.session['read-model-selection']({ tenant, session })
        const inUse = (selection as { body: { model: string } }).body.model
        expect(offered.filter(candidate => candidate['current'] === true)).toEqual([
          expect.objectContaining({ value: inUse }),
        ])

        expect(await asked('permission')).toEqual({
          outcome: 'succeeded',
          body: {
            candidates: [
              { value: 'never', title: '需要询问时拒绝' },
              { value: 'auto_permission', title: '需要询问时问人' },
              { value: 'bypass-permissions', title: '跳过询问；明确禁止的仍然不能做' },
            ],
          },
        })
        type Listed = {
          route: string
          reasoningEfforts?: string[]
          defaultReasoningEffort?: string
        }
        const listedModels = (
          JSON.parse((await tree.cli(['list-models'])).stdout) as { body: { models: Listed[] } }
        ).body.models
        const used = listedModels.find(model => model.route === inUse)
        const own = (selection as { body: { reasoningEffort?: string } }).body.reasoningEffort
        const marked = own ?? used?.defaultReasoningEffort
        const efforts = used?.reasoningEfforts ?? []
        expect(efforts.length).toBeGreaterThan(0)
        expect(await asked('effort')).toEqual({
          outcome: 'succeeded',
          body: {
            candidates: efforts.map(value =>
              value === marked ? { value, current: true } : { value },
            ),
          },
        })
        expect((await asked('archive')).outcome).toBe('not-found')

        const foreign = tenantOf(foreignTenant(savedTenant(tree.home)))
        const strange = await asked('model', { tenant: foreign, session })
        const other = `${session.slice(0, -1)}${session.endsWith('a') ? 'b' : 'a'}`
        const absent = await asked('model', { tenant, session: sessionRef(other) })
        expect(strange.outcome).not.toBe('succeeded')
        expect(strange).toEqual(absent)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'are not to be had, and not empty, while the owner of the models is not there',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const exitCode = await onReleaseTree(
        { script: toolCallsThenText(() => []), withoutRows: ['model-access'] },
        async tree => {
          const session = sessionRef(await settledSession(tree, 'hello'))
          const tenant = tenantOf(savedTenant(tree.home))
          const models = await read(tree, {
            tenant,
            session,
            command: 'omne-official:model',
            param: 0,
          })
          expect(models).toEqual({ outcome: 'basis-unavailable' })
        },
      )
      expect(exitCode).toBe(0)
    },
  )
})
