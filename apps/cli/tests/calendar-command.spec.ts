import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
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
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-calendar-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const answered: Answer = {
  outcome: 'succeeded',
  body: {
    calendar: 'cn-legal-holidays',
    version: 'v-1',
    coverageStart: '2022-12-31',
    coverageEnd: '2027-12-31',
    result: { kind: 'shift', date: '2026-10-08' },
  },
}

async function serve() {
  const service = await startFakeService((seen: Seen) =>
    seen.operation === 'answer'
      ? answered
      : seen.operation === 'list-calendars' || seen.operation === 'read-supply-health'
        ? { outcome: 'succeeded', body: { calendars: [] } }
        : seen.operation === 'read-environment'
          ? {
              outcome: 'succeeded',
              body: {
                calendar: 'cn-legal-holidays',
                timezone: 'Asia/Shanghai',
                revision: '1',
                version: 'v-1',
              },
            }
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
const sent = (service: FakeService, operation: string) =>
  service.seen.filter(seen => seen.operation === operation)

describe('omne calendar', () => {
  it.each([
    [['day', '--date', '2026-10-10'], { kind: 'day', date: '2026-10-10' }],
    [
      ['count', '--start', '2026-09-28', '--end', '2026-10-09'],
      { kind: 'count', from: '2026-09-28', to: '2026-10-09' },
    ],
    [
      ['shift', '--date', '2026-09-30', '--days', '1'],
      { kind: 'shift', date: '2026-09-30', direction: 'forward', days: 1 },
    ],
    [
      ['shift', '--date', '2026-10-08', '--days', '3', '--backward'],
      { kind: 'shift', date: '2026-10-08', direction: 'backward', days: 3 },
    ],
    [
      ['next', '--after', '2026-09-30', '--count', '2'],
      { kind: 'next', after: '2026-09-30', count: 2 },
    ],
    [
      ['nth', '--start', '2026-10-01', '--end', '2026-10-31', '--ordinal', 'last'],
      { kind: 'nth', periodStart: '2026-10-01', periodEnd: '2026-10-31', ordinal: 'last' },
    ],
  ])(
    'asks %j as one question for the acting tenant, naming no calendar',
    async (args, question) => {
      const service = await serve()
      const result = await cli(['calendar', ...args])
      expect(result.code).toBe(0)
      expect(sent(service, 'answer').map(seen => seen.body)).toEqual([
        { tenant: tenantText, question },
      ])
      expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'succeeded', body: answered.body })
    },
  )

  it('names the calendar and version a question asks about, as given', async () => {
    const service = await serve()
    expect(
      (await cli(['calendar', 'day', '--date', '2026-11-03', '--calendar', 'jp-legal-holidays']))
        .code,
    ).toBe(0)
    expect(
      (
        await cli([
          'calendar',
          'day',
          '--date',
          '2026-11-03',
          '--calendar',
          'jp-legal-holidays',
          '--version',
          'v-0',
        ])
      ).code,
    ).toBe(0)
    expect(sent(service, 'answer').map(seen => seen.body)).toEqual([
      {
        tenant: tenantText,
        question: { kind: 'day', date: '2026-11-03' },
        calendar: 'jp-legal-holidays',
      },
      {
        tenant: tenantText,
        question: { kind: 'day', date: '2026-11-03' },
        calendar: 'jp-legal-holidays',
        version: 'v-0',
      },
    ])
  })

  it('reads the supply health of the calendars', async () => {
    const service = await serve()
    expect((await cli(['calendar', 'health'])).code).toBe(0)
    expect(sent(service, 'read-supply-health').map(seen => seen.body)).toEqual([
      { tenant: tenantText },
    ])
  })

  it('lists the calendars and reads the environment', async () => {
    const service = await serve()
    expect((await cli(['calendar', 'list'])).code).toBe(0)
    expect((await cli(['calendar', 'environment'])).code).toBe(0)
    expect(sent(service, 'list-calendars').map(seen => seen.body)).toEqual([{ tenant: tenantText }])
    expect(sent(service, 'read-environment').map(seen => seen.body)).toEqual([
      { tenant: tenantText },
    ])
  })

  it.each([
    [['day']],
    [['day', '--date', '2026-02-30']],
    [['shift', '--date', '2026-09-30', '--days', '-1']],
    [['next', '--after', '2026-09-30', '--count', '0']],
    [['nth', '--start', '2026-10-01', '--end', '2026-10-31', '--ordinal', 'first']],
    [['week']],
  ])('refuses %j as a usage error and sends nothing', async args => {
    const service = await serve()
    const result = await cli(['calendar', ...args])
    expect(result.code).toBe(2)
    expect(result.stderr.startsWith('omne calendar')).toBe(true)
    expect(sent(service, 'answer')).toEqual([])
  })

  it('names the subcommand that was not recognized', async () => {
    await serve()
    expect((await cli(['calendar', 'week'])).stderr).toBe(commandUnrecognized('calendar'))
  })
})
