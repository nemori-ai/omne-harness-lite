import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commandMissing, commandUnrecognized } from './support/expected.ts'
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
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-usage-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const SESSION = 'a'.repeat(64)
const occupancy = {
  kind: 'known',
  used: '1501',
  window: '200000',
  percent: '0.75',
  compactAtPercent: '80',
  asOf: { at: '2026-11-19T10:00:00.120Z', model: 'm-a' },
}
const answers: Readonly<Record<string, Answer>> = {
  'read-context-occupancy': { outcome: 'succeeded', body: occupancy },
  'list-usage-records': { outcome: 'succeeded', body: { entries: [], next: null } },
  'query-usage': { outcome: 'not-found', body: {} },
}

async function serve() {
  const service = await startFakeService(
    (seen: Seen) => answers[seen.operation] ?? defaultAnswer(seen),
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
const sent = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation).map(seen => seen.body)
const range = ['--since', '2026-11-19T00:00:00Z', '--before', '2026-11-20T00:00:00Z']

describe('omne query-usage, list-usage-records and read-context-occupancy', () => {
  it('reads the occupancy of a session of the login tenant and prints the answer', async () => {
    const service = await serve()
    const result = await cli(['read-context-occupancy', '--session', SESSION])
    expect(result.code).toBe(0)
    expect(sent(service, 'read-context-occupancy')).toEqual([
      { tenant: tenantText, session: SESSION },
    ])
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'succeeded', body: occupancy })
  })

  it('queries a session by bucket and two dimensions, and a tenant with no bucket by default', async () => {
    const service = await serve()
    const session = await cli([
      'query-usage',
      ...range,
      '--zone',
      'Asia/Shanghai',
      '--session',
      SESSION,
      '--bucket',
      'day',
      '--group-by',
      'model,purpose',
    ])
    expect(session.code).toBe(3)
    const tenant = await cli(['query-usage', ...range, '--zone', 'UTC'])
    expect(tenant.code).toBe(3)
    const instants = { from: '2026-11-19T00:00:00Z', to: '2026-11-20T00:00:00Z' }
    expect(sent(service, 'query-usage')).toEqual([
      {
        tenant: tenantText,
        scope: { kind: 'session', session: SESSION },
        range: instants,
        zone: 'Asia/Shanghai',
        bucket: 'day',
        groupBy: ['model', 'purpose'],
      },
      {
        tenant: tenantText,
        scope: { kind: 'tenant' },
        range: instants,
        zone: 'UTC',
        bucket: 'none',
        groupBy: [],
      },
    ])
  })

  it('lists a page of records, a hundred by default, and continues after a cursor', async () => {
    const service = await serve()
    expect((await cli(['list-usage-records', ...range])).code).toBe(0)
    expect(
      (await cli(['list-usage-records', ...range, '--after', 'ur1.x', '--limit', '5'])).code,
    ).toBe(0)
    const instants = { from: '2026-11-19T00:00:00Z', to: '2026-11-20T00:00:00Z' }
    expect(sent(service, 'list-usage-records')).toEqual([
      { tenant: tenantText, scope: { kind: 'tenant' }, range: instants, after: null, limit: 100 },
      { tenant: tenantText, scope: { kind: 'tenant' }, range: instants, after: 'ur1.x', limit: 5 },
    ])
  })

  it.each([
    [['query-usage', ...range, '--zone', 'UTC', '--bucket', 'minute']],
    [['query-usage', ...range, '--zone', 'UTC', '--group-by', 'model,purpose,tool']],
    [['query-usage', ...range, '--zone', 'UTC', '--group-by', 'request']],
    [['query-usage', '--since', 'yesterday', '--before', '2026-11-20T00:00:00Z', '--zone', 'UTC']],
    [['list-usage-records', ...range, '--limit', '0']],
    [['list-usage-records', ...range, '--limit', '101']],
    [['list-usage-records', ...range, '--limit', '05']],
    [['read-context-occupancy', '--session', 'not-hex']],
  ])('refuses %j as a usage error and sends nothing', async args => {
    const service = await serve()
    const result = await cli(args)
    expect(result.code).toBe(2)
    expect(result.stderr).toBe(commandUnrecognized(args[0] ?? ''))
    expect(service.seen.filter(seen => Object.hasOwn(answers, seen.operation))).toEqual([])
  })

  it('passes every bucket and dimension it knows', async () => {
    const service = await serve()
    for (const bucket of ['none', 'hour', 'day', 'week', 'month'])
      await cli(['query-usage', ...range, '--zone', 'UTC', '--bucket', bucket])
    for (const groupBy of ['source,model', 'provider,purpose', 'tool'])
      await cli(['query-usage', ...range, '--zone', 'UTC', '--group-by', groupBy])
    expect(sent(service, 'query-usage').map(body => [body['bucket'], body['groupBy']])).toEqual([
      ['none', []],
      ['hour', []],
      ['day', []],
      ['week', []],
      ['month', []],
      ['none', ['source', 'model']],
      ['none', ['provider', 'purpose']],
      ['none', ['tool']],
    ])
  })

  it('names the option a read misses', async () => {
    await serve()
    expect((await cli(['read-context-occupancy'])).stderr).toBe(
      commandMissing('read-context-occupancy', '--session'),
    )
    expect((await cli(['query-usage', ...range])).stderr).toBe(
      commandMissing('query-usage', '--zone'),
    )
  })
})
