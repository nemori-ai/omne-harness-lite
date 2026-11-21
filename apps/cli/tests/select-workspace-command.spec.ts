import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnswer,
  sessionId,
  startFakeService,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-select-workspace-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const WORKSPACE = 'wsp_00000000000000000000000001'
const INSTANCE = 'wsi_00000000000000000000000001'
const TARGET = { workspace: WORKSPACE, instance: INSTANCE }

async function serve(selected?: Answer) {
  const service = await startFakeService((seen: Seen) =>
    seen.operation === 'select-workspace'
      ? (selected ?? {
          outcome: 'succeeded',
          body: { controlId: seen.body['controlId'], directory: '/srv/blog' },
        })
      : (defaultAnswer(seen) ?? { outcome: 'succeeded', body: {} }),
  )
  services.push(service)
  const login = await runInProcess(
    ['login', '--login-identifier', 'alice', '--server', service.origin],
    { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') },
  )
  expect(login.code).toBe(0)
  return service
}
const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') })
const OWNER = ['--tenant', tenantText]
const sent = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation)

describe('omne select-workspace', () => {
  it('selects an instance of a workspace under a new control identity', async () => {
    const service = await serve()
    const result = await cli([
      'select-workspace',
      '--session',
      sessionId,
      '--workspace',
      WORKSPACE,
      '--instance',
      INSTANCE,
      ...OWNER,
    ])
    expect([result.code, result.stderr]).toEqual([0, ''])
    const [call] = sent(service, 'select-workspace')
    expect(call?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      controlId: call?.body['controlId'],
      workspace: TARGET,
    })
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { directory: '/srv/blog' },
      request: { controlId: call?.body['controlId'] },
    })
  })

  it('takes the workspace away with --none, under the control identity it was given', async () => {
    const service = await serve()
    const args = [
      'select-workspace',
      '--session',
      sessionId,
      '--none',
      '--control-id',
      'c-7',
      ...OWNER,
    ]
    expect((await cli(args)).code).toBe(0)
    expect(sent(service, 'select-workspace')[0]?.body).toEqual({
      tenant: tenantText,
      session: sessionId,
      controlId: 'c-7',
      workspace: null,
    })
  })

  it('reports a target Workspace refused with its reason and exits 3', async () => {
    await serve({ outcome: 'invalid', body: { reason: 'instance-unavailable' } })
    const result = await cli([
      'select-workspace',
      '--session',
      sessionId,
      '--workspace',
      WORKSPACE,
      '--instance',
      INSTANCE,
      ...OWNER,
    ])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout).body).toEqual({ reason: 'instance-unavailable' })
  })

  it.each([
    [['--session', sessionId]],
    [['--session', sessionId, '--workspace', WORKSPACE]],
    [['--session', sessionId, '--instance', INSTANCE]],
    [['--session', sessionId, '--workspace', WORKSPACE, '--instance', INSTANCE, '--none']],
    [['--session', sessionId, '--none', '--none']],
    [['--none']],
  ])('refuses %j as a usage error and sends nothing', async args => {
    const service = await serve()
    const result = await cli(['select-workspace', ...args, ...OWNER])
    expect(result.code).toBe(2)
    expect(sent(service, 'select-workspace')).toEqual([])
  })
})

describe('omne create-session with a workspace', () => {
  it('names the instance the session starts in', async () => {
    const service = await serve()
    const args = [
      'create-session',
      '--definition',
      'coding',
      '--workspace',
      WORKSPACE,
      '--instance',
      INSTANCE,
    ]
    expect((await cli(args)).code).toBe(0)
    expect(sent(service, 'create-session')[0]?.body).toMatchObject({
      definition: 'coding',
      workspace: TARGET,
    })
  })

  it('names none when neither option is given', async () => {
    const service = await serve()
    expect((await cli(['create-session', '--definition', 'coding'])).code).toBe(0)
    expect(sent(service, 'create-session')[0]?.body).not.toHaveProperty('workspace')
  })

  it.each([[['--workspace', WORKSPACE]], [['--instance', INSTANCE]]])(
    'refuses %j alone as a usage error and sends nothing',
    async half => {
      const service = await serve()
      const result = await cli(['create-session', '--definition', 'coding', ...half])
      expect(result.code).toBe(2)
      expect(sent(service, 'create-session')).toEqual([])
    },
  )
})
