import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandUnrecognized, notLoggedIn } from './support/expected.ts'
import {
  defaultAnswer,
  otherTenantText,
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

describe('omne workspace: who takes part, leaving and destroying', () => {
  const OTHER = otherTenantText
  const none: Answer = { outcome: 'succeeded', body: {} }
  const changes = [
    ['grant', 'grant-participation'],
    ['grant-admin', 'grant-admin'],
    ['revoke-admin', 'revoke-admin'],
    ['remove', 'remove'],
  ] as const

  it.each(changes)(
    '%s sends %s with the workspace, the target and a new operation name',
    async (action, operation) => {
      const service = await serve({ [operation]: none })
      const result = await cli(['workspace', action, WORKSPACE, OTHER])
      expect([result.code, result.stderr]).toEqual([0, ''])
      const [call] = sent(service, operation)
      expect(call?.body).toEqual({
        tenant: tenantText,
        operation: call?.body['operation'],
        workspace: WORKSPACE,
        target: OTHER,
      })
      expect(JSON.parse(result.stdout)).toMatchObject({
        outcome: 'succeeded',
        request: { tenant: tenantText, operation: call?.body['operation'] },
      })
    },
  )

  it('leave names the workspace alone', async () => {
    const service = await serve({ leave: none })
    expect((await cli(['workspace', 'leave', WORKSPACE])).code).toBe(0)
    expect(sent(service, 'leave')[0]?.body).toEqual({
      tenant: tenantText,
      operation: expect.any(String),
      workspace: WORKSPACE,
    })
  })

  it('destroy says what it does and sends nothing until --yes is given', async () => {
    const service = await serve({ destroy: none })
    const asked = await cli(['workspace', 'destroy', WORKSPACE])
    expect(asked.code).toBe(2)
    expect(asked.stderr).toBe(
      'omne workspace destroy: this ends the registration and every relation of the workspace; its directories are not deleted. To do it, run it again with --yes\n',
    )
    expect(sent(service, 'destroy')).toEqual([])
    expect((await cli(['workspace', 'destroy', WORKSPACE, '--yes'])).code).toBe(0)
    expect(sent(service, 'destroy')[0]?.body).toMatchObject({ workspace: WORKSPACE })
  })

  it('resumed, a change asks its own query first and commits only what was not committed', async () => {
    const service = await serve({ 'query-remove': none, remove: none })
    await cli(['workspace', 'remove', WORKSPACE, OTHER, '--resume', 'op-9'])
    expect(sent(service, 'query-remove').map(seen => seen.body)).toEqual([
      { tenant: tenantText, operation: 'op-9', workspace: WORKSPACE, target: OTHER },
    ])
    expect(sent(service, 'remove')).toEqual([])
    const open = await serve({
      'query-leave': { outcome: 'not-committed', body: {} },
      leave: none,
    })
    await cli(['workspace', 'leave', WORKSPACE, '--resume', 'op-9'])
    expect(sent(open, 'leave').map(seen => seen.body['operation'])).toEqual(['op-9'])
  })

  it('a refusal carries its reason and exits 3; an uncertain result names the operation', async () => {
    await serve({ 'grant-admin': { outcome: 'invalid', body: { reason: 'not-a-participant' } } })
    const refused = await cli(['workspace', 'grant-admin', WORKSPACE, OTHER])
    expect(refused.code).toBe(3)
    expect(JSON.parse(refused.stdout).body).toEqual({ reason: 'not-a-participant' })
    const service = await serve({ leave: { outcome: 'unknown', body: {} } })
    const lost = await cli(['workspace', 'leave', WORKSPACE])
    expect(lost.code).toBe(5)
    expect(lost.stderr).toContain(
      `run it again with --resume ${String(sent(service, 'leave')[0]?.body['operation'])}`,
    )
  })
})

describe('omne workspace associate and dissociate', () => {
  const INSTANCE = 'wsi_00000000000000000000000002'
  const associated: Answer = { outcome: 'succeeded', body: { instance: INSTANCE } }
  const none: Answer = { outcome: 'succeeded', body: {} }

  it('associate sends the workspace and the real path of the directory, and reports the instance', async () => {
    const service = await serve({ associate: associated })
    const real = join(root, 'feature')
    mkdirSync(real)
    symlinkSync(real, join(root, 'link'))
    const result = await cli(['workspace', 'associate', WORKSPACE, join(root, 'link')])
    expect([result.code, result.stderr]).toEqual([0, ''])
    const [call] = sent(service, 'associate')
    expect(call?.body).toEqual({
      tenant: tenantText,
      operation: call?.body['operation'],
      workspace: WORKSPACE,
      address: real,
    })
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'succeeded',
      body: { instance: INSTANCE },
      request: { operation: call?.body['operation'] },
    })
  })

  it('dissociate sends the workspace and the instance as they were given', async () => {
    const service = await serve({ dissociate: none })
    expect((await cli(['workspace', 'dissociate', WORKSPACE, INSTANCE])).code).toBe(0)
    expect(sent(service, 'dissociate')[0]?.body).toEqual({
      tenant: tenantText,
      operation: expect.any(String),
      workspace: WORKSPACE,
      instance: INSTANCE,
    })
  })

  it('resumed, each asks its own query first and commits only what was not committed', async () => {
    const service = await serve({ 'query-associate': associated, associate: associated })
    const resumed = ['workspace', 'associate', WORKSPACE, '/work/feature', '--resume', 'op-9']
    expect((await cli(resumed)).code).toBe(0)
    expect(sent(service, 'query-associate')[0]?.body).toMatchObject({ operation: 'op-9' })
    expect(sent(service, 'associate')).toEqual([])
    const open = await serve({
      'query-dissociate': { outcome: 'not-committed', body: {} },
      dissociate: none,
    })
    expect(
      (await cli(['workspace', 'dissociate', WORKSPACE, INSTANCE, '--resume', 'op-8'])).code,
    ).toBe(0)
    expect(sent(open, 'dissociate')[0]?.body).toMatchObject({ operation: 'op-8' })
  })

  it('a refusal carries its reason and exits 3', async () => {
    await serve({ associate: { outcome: 'invalid', body: { reason: 'not-the-same-resource' } } })
    const result = await cli(['workspace', 'associate', WORKSPACE, '/work/other'])
    expect(result.code).toBe(3)
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'invalid',
      body: { reason: 'not-the-same-resource' },
    })
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
    [['associate', WORKSPACE]],
    [['associate', WORKSPACE, '/a', '--type', 'git']],
    [['dissociate', WORKSPACE]],
    [['dissociate', WORKSPACE, 'wsi_1', '--yes']],
    [['constructor']],
    [['grant', WORKSPACE]],
    [['grant', WORKSPACE, 'nobody']],
    [['remove', WORKSPACE, '--resume', 'op-1']],
    [['leave']],
    [['leave', WORKSPACE, '--yes']],
    [['destroy']],
    [['destroy', '--yes']],
  ])('%j is a usage error', async args => {
    const service = await serve()
    const result = await cli(['workspace', ...args])
    expect(result.code).toBe(2)
    expect(result.stderr.startsWith('omne workspace')).toBe(true)
    expect(service.seen.filter(seen => !['issue-login'].includes(seen.operation))).toEqual([])
  })

  it('exits 1 when nobody has logged in', async () => {
    expect(await cli(['workspace', 'list'])).toMatchObject({
      code: 1,
      stdout: '',
      stderr: notLoggedIn,
    })
  })

  it('names the subcommand that was not recognized', async () => {
    await serve()
    expect((await cli(['workspace', 'attach'])).stderr).toBe(commandUnrecognized('workspace'))
    expect((await cli(['workspace', 'register', '--type', 'git'])).stderr).toBe(
      commandUnrecognized('workspace register'),
    )
  })
})
