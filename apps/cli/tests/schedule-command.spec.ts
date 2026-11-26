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
const job = {
  job: 'j-1',
  state: 'running',
  outcome: null,
  stop: 'none',
  origin: 'due',
  acceptedAt: '2027-01-01T00:01:00.000Z',
  startedAt: '2027-01-01T00:01:01.000Z',
  endedAt: null,
  schedule: 's-1',
  slot: '2027-01-01T00:01:00.000Z',
  local: '2027-01-01T00:01:00',
  calendar: null,
  version: null,
  revision: 1,
  work: { kind: 'program', programRef: 'probe', input: {} },
  reason: null,
  where: null,
  events: [],
}
const answers: Readonly<Record<string, unknown>> = {
  'list-schedules': { items: [card], next: null },
  'list-jobs': { items: [], next: null },
  'read-job': job,
  'cancel-job': { changed: true, job },
  'query-cancel-job': job,
  'start-job': job,
  'query-start-job': job,
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

  it('edits the instruction from a JSON file: the goal body the agent work is to achieve', async () => {
    const service = await serve()
    const path = definitionFile('{"purpose":"写周报","criteria":[]}')
    const at = ['--schedule', 's-1', '--revision', '3', '--action-id', 'a-1']
    const edited = await cli(['schedule', 'edit', ...at, '--instruction-file', path])
    expect(edited.code, edited.stderr).toBe(0)
    expect(body(service, 'manage-schedule')).toEqual({
      tenant: tenantText,
      actionId: 'a-1',
      schedule: 's-1',
      revision: 3,
      action: { kind: 'edit', instruction: { purpose: '写周报', criteria: [] } },
    })
    const missing = await cli(['schedule', 'edit', ...at, '--instruction-file', `${path}.none`])
    expect(missing.code).toBe(2)
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

  it('lists the Jobs of a schedule or of the whole tenant, and shows one Job', async () => {
    const service = await serve()
    const listed = await cli(['schedule', 'jobs'])
    expect(listed.code, listed.stderr).toBe(0)
    expect(body(service, 'list-jobs')).toEqual({
      tenant: tenantText,
      schedule: null,
      cursor: null,
      limit: 100,
    })
    await cli(['schedule', 'jobs', '--schedule', 's-1'])
    expect(body(service, 'list-jobs')).toMatchObject({ schedule: 's-1' })
    const shown = await cli(['schedule', 'job', '--job', 'j-1'])
    expect(shown.code).toBe(0)
    expect(body(service, 'read-job')).toEqual({ tenant: tenantText, job: 'j-1' })
  })

  it('cancels a Job with a fresh client id; recalls it only by the id it was sent with', async () => {
    const service = await serve()
    expect((await cli(['schedule', 'cancel-job', '--job', 'j-1'])).code).toBe(0)
    expect(body(service, 'cancel-job')).toMatchObject({ job: 'j-1', actionId: expect.any(String) })
    expect((await cli(['schedule', 'cancel-job', '--job', 'j-1', '--query'])).code).toBe(2)
    await cli(['schedule', 'cancel-job', '--job', 'j-1', '--action-id', 'a-9', '--query'])
    expect(body(service, 'query-cancel-job')).toMatchObject({ job: 'j-1', actionId: 'a-9' })
  })

  it('starts a Job directly from a work file; recalls it by the start id', async () => {
    const service = await serve()
    const path = join(root, 'work.json')
    writeFileSync(path, '{"kind":"program","programRef":"probe","input":{}}')
    expect((await cli(['schedule', 'start-job', '--work-file', path])).code).toBe(0)
    expect(body(service, 'start-job')).toMatchObject({
      work: { kind: 'program', programRef: 'probe', input: {} },
      startId: expect.any(String),
    })
    expect((await cli(['schedule', 'start-job', '--work-file', path, '--query'])).code).toBe(2)
    await cli(['schedule', 'start-job', '--work-file', path, '--start-id', 's-9', '--query'])
    expect(body(service, 'query-start-job')).toMatchObject({ startId: 's-9' })
    expect(body(service, 'start-job')).toMatchObject({
      startId: expect.not.stringMatching(/^s-9$/),
    })
  })
})
