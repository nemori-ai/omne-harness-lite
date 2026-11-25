// @module-tag slow
import { describe, expect, it } from 'vitest'
import {
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
  type ReleaseTree,
} from '../../support/release-tree.ts'

type Listed = Readonly<{
  status: number | null
  outcome: string | undefined
  models: readonly Readonly<{
    route: string
    selectable: boolean
    reasons: readonly string[]
    enabled?: boolean
    credential: string
    input: readonly string[]
    output: readonly string[]
  }>[]
}>

// Through the command line: the new address, the access plugin and the member's own principal.
async function listOnce(tree: ReleaseTree): Promise<Listed> {
  const ran = await tree.cli(['list-models'])
  const printed = JSON.parse(ran.stdout || '{}') as {
    outcome?: string
    body?: { models?: Listed['models'] }
  }
  return { status: ran.status, outcome: printed.outcome, models: printed.body?.models ?? [] }
}

// A protocol is mounted a moment after its row starts; a client waits for it as it does for any.
const listModels = (tree: ReleaseTree): Promise<Listed> =>
  pollUntil(
    'model/v1 to be mounted',
    () => listOnce(tree),
    listed => listed.outcome !== undefined,
  )

describe('the release tree and the list of models (C20, C21, C22)', () => {
  it(
    'lists the models of both vendors to a member, each with whether it can be selected',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids).toContain('model-access')
        const listed = await listModels(tree)
        expect(listed).toMatchObject({ status: 0, outcome: 'succeeded' })
        const routes = listed.models.map(model => model.route)
        expect(routes.some(route => route.startsWith('anthropic/'))).toBe(true)
        expect(routes.some(route => route.startsWith('openai/'))).toBe(true)
        expect(new Set(routes).size).toBe(routes.length)
        for (const model of listed.models) {
          expect(model.input).toContain('text')
          expect(model.selectable).toBe(model.reasons.length === 0 && model.enabled !== false)
        }
        // What the list says can be selected, a session of the member can select.
        const session = await tree.startSession('hello')
        const pick = listed.models.find(model => model.selectable)
        if (pick === undefined) throw new Error('no model can be selected')
        const selected = await tree.cli([
          'select-model',
          '--session',
          session,
          '--model',
          pick.route,
        ])
        expect(JSON.parse(selected.stdout)).toMatchObject({
          outcome: 'succeeded',
          body: { model: pick.route, credential: pick.credential },
        })
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'a session created with a listed model stands at it; one created with an unknown model is not created (C23)',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        const listed = await listModels(tree)
        const picks = listed.models.filter(model => model.selectable).map(model => model.route)
        const [first, second] = [picks.at(0), picks.at(-1)]
        if (first === undefined || second === undefined || first === second)
          throw new Error('the release lists fewer than two selectable models')
        const run = async (...argv: string[]) => {
          const ran = await tree.cli(argv)
          const said = JSON.parse(ran.stdout || '{}') as Record<string, any>
          return { ...said, status: ran.status } as Record<string, any>
        }
        const created = await run('create-session', '--definition', 'coding', '--model', second)
        expect(created).toMatchObject({ status: 0, outcome: 'succeeded' })
        const session = String(created['body'].session)
        expect(await run('read-model-selection', '--session', session)).toMatchObject({
          outcome: 'succeeded',
          body: { model: second },
        })
        // Selecting another one moves it; the read says where the session stands now.
        expect(await run('select-model', '--session', session, '--model', first)).toMatchObject({
          outcome: 'succeeded',
        })
        expect(await run('read-model-selection', '--session', session)).toMatchObject({
          body: { model: first },
        })
        const refused = await run('create-session', '--definition', 'coding', '--model', 'no/such')
        expect(refused).toMatchObject({ outcome: 'invalid' })
        expect(refused['status']).not.toBe(0)
        // Without a model the session stands at what the deployment maps its definition to.
        const plain = await run('create-session', '--definition', 'coding')
        const mapped = await run('read-model-selection', '--session', String(plain['body'].session))
        expect(mapped).toMatchObject({ outcome: 'succeeded' })
        expect(picks).toContain(mapped['body'].model)
      })
      expect(exitCode).toBe(0)
    },
  )

  it(
    'starts without the row and a session talks: the list says its basis is unavailable',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const options = { script: toolCallsThenText(() => []), withoutRows: ['model-access'] }
      const exitCode = await onReleaseTree(options, async tree => {
        const ids = tree.records.filter(r => r['kind'] === 'tree').map(r => r['id'])
        expect(ids).not.toContain('model-access')
        await pollUntil(
          'session/v1 to be mounted',
          () => tree.cli(['list-archived-sessions']),
          ran => ran.status === 0,
        )
        const session = await tree.startSession('hello')
        expect(session).toMatch(/^[0-9a-f]{64}$/)
        const listed = await listOnce(tree)
        expect(listed.status).not.toBe(0)
        expect(listed.models).toEqual([])
      })
      expect(exitCode).toBe(0)
    },
  )
})
