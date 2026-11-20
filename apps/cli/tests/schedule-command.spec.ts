import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnswer,
  startFakeService,
  tenantText,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-schedule-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const card = {
  schedule: 's-1',
  label: '交月报',
  control: 'active',
  standing: 'ready',
  author: { kind: 'human' },
  next: null,
  revision: 1,
}
const detail = {
  ...card,
  createdAt: '2026-11-17T00:00:00.000Z',
  definition: {},
}
const answers: Readonly<Record<string, unknown>> = {
  'list-schedules': { items: [card], next: null },
  'create-schedule': detail,
  'query-create-schedule': detail,
  'manage-schedule': detail,
}

async function serve() {
  const service = await startFakeService((seen: Seen) =>
    Object.hasOwn(answers, seen.operation)
      ? { outcome: 'succeeded', body: answers[seen.operation] }
      : defaultAnswer(seen),
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
const body = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation).at(-1)?.body
function definitionFile(content = '{"label":"交月报"}') {
  const path = join(root, 'definition.json')
  writeFileSync(path, content)
  return path
}

describe('omne schedule', () => {
  it('lists the schedules not in a terminal state unless asked for all', async () => {
    const service = await serve()
    expect((await cli(['schedule', 'list'])).code).toBe(0)
    expect(body(service, 'list-schedules')).toEqual({
      tenant: tenantText,
      control: null,
      terminal: false,
      cursor: null,
      limit: 100,
    })
    await cli(['schedule', 'list', '--all', '--state', 'paused'])
    expect(body(service, 'list-schedules')).toMatchObject({ control: 'paused', terminal: true })
  })

  it('creates from a definition file, active unless --draft, with a fresh client id', async () => {
    const service = await serve()
    const path = definitionFile()
    expect((await cli(['schedule', 'create', '--definition-file', path])).code).toBe(0)
    expect(body(service, 'create-schedule')).toMatchObject({
      tenant: tenantText,
      definition: { label: '交月报' },
      state: 'active',
      reason: null,
      createId: expect.any(String),
    })
    await cli(['schedule', 'create', '--definition-file', path, '--draft', '--reason', '先放着'])
    expect(body(service, 'create-schedule')).toMatchObject({ state: 'draft', reason: '先放着' })
  })

  it('recalls a create only by the client id it was sent with', async () => {
    const service = await serve()
    const path = definitionFile()
    expect((await cli(['schedule', 'create', '--definition-file', path, '--query'])).code).toBe(2)
    await cli(['schedule', 'create', '--definition-file', path, '--create-id', 'c-1', '--query'])
    expect(body(service, 'query-create-schedule')).toMatchObject({ createId: 'c-1' })
    expect(body(service, 'create-schedule')).toBeUndefined()
  })

  it.each([
    [['rename', '--label', '新名字'], { kind: 'rename', label: '新名字' }],
    [['edit', '--instruction', '写周报'], { kind: 'edit', instruction: '写周报' }],
    [['pause'], { kind: 'pause', reason: null }],
    [['stop', '--reason', '不要了'], { kind: 'stop', reason: '不要了' }],
    [['discard'], { kind: 'discard', reason: null }],
    [['promote'], { kind: 'promote', reason: null }],
  ])('sends %j as one manage action at the revision it read', async (args, action) => {
    const service = await serve()
    const [name, ...rest] = args
    const result = await cli([
      'schedule',
      name ?? '',
      '--schedule',
      's-1',
      '--revision',
      '3',
      ...rest,
    ])
    expect(result.code).toBe(0)
    expect(body(service, 'manage-schedule')).toMatchObject({ schedule: 's-1', revision: 3, action })
  })

  it('revises and replaces with a definition file and a reason', async () => {
    const service = await serve()
    const path = definitionFile('{"label":"新规则"}')
    await cli([
      'schedule',
      'replace',
      '--schedule',
      's-1',
      '--revision',
      '2',
      '--definition-file',
      path,
      '--reason',
      '换',
    ])
    expect(body(service, 'manage-schedule')).toMatchObject({
      action: { kind: 'replace', definition: { label: '新规则' }, reason: '换' },
    })
  })

  it.each([
    [['create', '--definition-file', '/no/such/file.json']],
    [['pause', '--schedule', 's-1', '--revision', 'x']],
    [['list', '--state', 'gone']],
    [['preview']],
    [['preview', '--schedule', 's', '--definition-file', '/x.json']],
    [['reconfirm', '--schedule', 's-1', '--revision', '1']],
  ])('refuses %j as a usage error and sends nothing', async args => {
    const service = await serve()
    const before = service.seen.length
    expect((await cli(['schedule', ...args])).code).toBe(2)
    expect(service.seen.length).toBe(before)
  })
})
