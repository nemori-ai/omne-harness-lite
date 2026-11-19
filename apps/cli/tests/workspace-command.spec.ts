import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized } from './support/expected.ts'
import {
  defaultAnswer,
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
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-workspace-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const WORKSPACE = 'wsp_00000000000000000000000001'
const registered = {
  workspace: WORKSPACE,
  instance: 'wsi_00000000000000000000000001',
  type: 'directory',
}
const ok = (body: unknown): Answer => ({ outcome: 'succeeded', body })

/** Answers the four workspace operations; `answers` overrides one by its operation name. */
async function serve(answers: Readonly<Record<string, Answer>> = {}) {
  const service = await startFakeService((seen: Seen) => {
    const given = answers[seen.operation]
    if (given !== undefined) return given
    switch (seen.operation) {
      case 'register':
      case 'query-register':
        return ok(registered)
      case 'list':
        return ok({ workspaces: [{ workspace: WORKSPACE, type: 'directory', standing: 'owner' }] })
      case 'describe':
        return ok({ workspace: WORKSPACE, type: 'directory', standing: 'owner', instances: [] })
      default:
        return defaultAnswer(seen) ?? ok({})
    }
  })
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
const sent = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation)

describe('omne workspace register', () => {
  it('sends the real path of the directory with a new operation name for the acting tenant', async () => {
    const service = await serve()
    const project = join(root, 'blog')
    mkdirSync(project)
    symlinkSync(project, join(root, 'link'))
    const result = await cli(['workspace', 'register', join(root, 'link')])
    expect(result.code).toBe(0)
    const [call] = sent(service, 'register')
    expect(call?.body).toEqual({
      tenant: tenantText,
      operation: call?.body['operation'],
      address: project,
    })
    expect(call?.body['operation']).toEqual(expect.any(String))
    expect(call?.body['operation']).not.toBe(call?.messageId)
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: registered,
      request: { tenant: tenantText, operation: call?.body['operation'] },
    })
    expect(result.stderr).toBe('')
    expect(sent(service, 'query-register')).toEqual([])
  })

  it('sends a directory this machine cannot resolve as the absolute path it was given', async () => {
    const service = await serve()
    await cli(['workspace', 'register', join(root, 'not', 'here'), '--type', 'git'])
    expect(sent(service, 'register')[0]?.body).toMatchObject({
      address: join(root, 'not', 'here'),
      type: 'git',
    })
  })

  it('names the operation on standard error when the result is uncertain', async () => {
    const service = await serve({ register: { outcome: 'unknown', body: {} } })
    const result = await cli(['workspace', 'register', root])
    const operation = String(sent(service, 'register')[0]?.body['operation'])
    expect(result.code).toBe(5)
    expect(result.stderr).toBe(
      `omne workspace register: to learn the result, run it again with --resume ${operation}\n` +
        'omne workspace register: result uncertain\n',
    )
  })

  it('resumed, asks first what was done and does not commit again when it was', async () => {
    const service = await serve()
    const result = await cli(['workspace', 'register', root, '--resume', 'op-7'])
    expect(result.code).toBe(0)
    expect(sent(service, 'query-register').map(seen => seen.body)).toEqual([
      { tenant: tenantText, operation: 'op-7', address: root },
    ])
    expect(sent(service, 'register')).toEqual([])
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'succeeded', body: registered })
  })

  it('resumed, commits under the same operation name when nothing was done', async () => {
    const service = await serve({ 'query-register': { outcome: 'not-committed', body: {} } })
    const result = await cli(['workspace', 'register', root, '--resume', 'op-7'])
    expect(result.code).toBe(0)
    expect(sent(service, 'register').map(seen => seen.body)).toEqual([
      { tenant: tenantText, operation: 'op-7', address: root },
    ])
  })

  it('resumed, stops at a query that could not answer and commits nothing', async () => {
    const service = await serve({
      'query-register': { outcome: 'basis-unavailable', body: {} },
    })
    const result = await cli(['workspace', 'register', root, '--resume', 'op-7'])
    expect(result.code).toBe(4)
    expect(sent(service, 'register')).toEqual([])
  })

  it('reports a refusal with its reason and exits 3', async () => {
    await serve({ register: { outcome: 'invalid', body: { reason: 'occupied' } } })
    const result = await cli(['workspace', 'register', root])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'invalid',
      body: { reason: 'occupied' },
    })
  })
})

describe('omne workspace list and show', () => {
  it('lists the workspaces of the acting tenant', async () => {
    const service = await serve()
    const result = await cli(['workspace', 'list'])
    expect(result.code).toBe(0)
    const [call] = sent(service, 'list')
    expect(call?.body).toEqual({ tenant: tenantText })
    expect(JSON.parse(result.stdout).request).toEqual({
      messageId: call?.messageId,
      tenant: tenantText,
    })
    expect(JSON.parse(result.stdout).body.workspaces).toHaveLength(1)
  })

  it('shows one workspace by its identity', async () => {
    const service = await serve()
    const result = await cli(['workspace', 'show', WORKSPACE])
    expect(result.code).toBe(0)
    expect(sent(service, 'describe').map(seen => seen.body)).toEqual([
      { tenant: tenantText, workspace: WORKSPACE },
    ])
  })

  it('a workspace that is not found exits 3', async () => {
    await serve({ describe: { outcome: 'not-found', body: {} } })
    expect((await cli(['workspace', 'show', WORKSPACE])).code).toBe(3)
  })
})

describe('what omne workspace refuses before it sends anything', () => {
  it.each([
    [['register']],
    [['register', '--type', 'git']],
    [['register', '/a', '--type']],
    [['register', '/a', '--force']],
    [['list', 'extra']],
    [['show']],
    [['show', WORKSPACE, '--type', 'git']],
    [['destroy', WORKSPACE]],
    [['constructor']],
  ])('%j is a usage error', async args => {
    const service = await serve()
    const result = await cli(['workspace', ...args])
    expect(result.code).toBe(2)
    expect(result.stderr.startsWith('omne workspace')).toBe(true)
    expect(service.seen.filter(seen => !['issue-login'].includes(seen.operation))).toEqual([])
  })

  it('names the subcommand that was not recognized', async () => {
    await serve()
    expect((await cli(['workspace', 'destroy'])).stderr).toBe(commandUnrecognized('workspace'))
    expect((await cli(['workspace', 'register', '--type', 'git'])).stderr).toBe(
      commandUnrecognized('workspace register'),
    )
  })
})
