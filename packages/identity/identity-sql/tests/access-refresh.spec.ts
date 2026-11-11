// The access refresh granularity g (identity ID-18「成功业务访问报告」, SPEC IS-14): reports within g
// of the last refresh commit nothing, the next report after g commits one refresh, and the idle
// period still ends a login that nobody reports. g is checked against the idle period at start.
import { afterEach, expect, it } from 'vitest'
import type { CommitRequestV2, SqlStorage } from '@omne-harness/sql-contract'
import { addDuration } from '../src/deadline.ts'
import { IDENTITY_SQL_DEFAULT_CONFIG, parseIdentitySqlConfig } from '@omne-harness/identity-sql'
import { duration, openProvider, SHORT, type OpenedProvider } from './fixtures/provider.ts'

const CREDENTIALS = { loginIdentifier: 'refresh-ada', credential: 'credential-ada' }
const opened: OpenedProvider[] = []

afterEach(async () => {
  for (const item of opened.splice(0)) await item.close()
})

const isReport = (request: CommitRequestV2): boolean =>
  request.commands.some(command => command.facts['kind'] === 'report-access')

async function loggedIn() {
  const reports: CommitRequestV2[] = []
  const wrap = (storage: SqlStorage): SqlStorage => ({
    ...storage,
    commit: (request, options) => {
      if (isReport(request)) reports.push(request)
      return storage.commit(request, options)
    },
  })
  const deployment = await openProvider({ wrap, accessRefreshGranularity: 'PT60S' })
  opened.push(deployment)
  const { operations, governance } = deployment.provider
  if ((await operations.registerAndActivate(CREDENTIALS)).kind !== 'succeeded')
    throw new Error('registration failed')
  const issued = await operations.issueLogin(CREDENTIALS)
  if (issued.kind !== 'succeeded') throw new Error('issue failed')
  return { deployment, operations, governance, issued, reports }
}

it('commits one refresh per granularity, and the idle period still ends the login', async () => {
  const { deployment, operations, governance, issued, reports } = await loggedIn()
  const login = { login: issued.login }
  deployment.clock.advanceBy(duration('PT30S'))
  for (let index = 0; index < 3; index += 1)
    expect(await governance.reportBusinessAccess(login)).toEqual({
      kind: 'refreshed',
      idleDeadline: issued.idleDeadline,
    })
  expect(reports).toHaveLength(0)

  deployment.clock.advanceBy(duration('PT31S'))
  const refreshed = await governance.reportBusinessAccess(login)
  expect(refreshed).toEqual({
    kind: 'refreshed',
    idleDeadline: addDuration(deployment.clock.current(), duration(SHORT)),
  })
  expect(reports).toHaveLength(1)
  deployment.clock.advanceBy(duration('PT1S'))
  expect(await governance.reportBusinessAccess(login)).toEqual(refreshed)
  expect(reports).toHaveLength(1)

  if (refreshed.kind !== 'refreshed') throw new Error('not refreshed')
  deployment.clock.setTo(refreshed.idleDeadline)
  expect((await operations.recognizeLogin({ loginProof: issued.loginProof })).kind).toBe('invalid')
  expect((await governance.reportBusinessAccess(login)).kind).toBe('not-refreshed')
})

it('refuses a configuration whose granularity is not shorter than the idle period', () => {
  expect(parseIdentitySqlConfig(IDENTITY_SQL_DEFAULT_CONFIG).kind).toBe('valid')
  expect(
    parseIdentitySqlConfig({
      ...IDENTITY_SQL_DEFAULT_CONFIG,
      accessRefreshGranularity: IDENTITY_SQL_DEFAULT_CONFIG.idlePeriod,
    }),
  ).toEqual({
    kind: 'invalid',
    problems: [{ field: 'accessRefreshGranularity', rule: 'must be shorter than idlePeriod' }],
  })
  const { accessRefreshGranularity: _omitted, ...missing } = IDENTITY_SQL_DEFAULT_CONFIG as Record<
    string,
    string
  >
  expect(parseIdentitySqlConfig(missing)).toEqual({
    kind: 'invalid',
    problems: [{ field: 'accessRefreshGranularity', rule: 'must be PT<seconds>S text' }],
  })
})
