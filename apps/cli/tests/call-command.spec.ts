import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GuestContractData } from '@omne-harness/public-contract'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
let state: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-call-')))
  state = join(root, 'state')
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const cli = (argv: readonly string[]) =>
  runInProcess(argv, { omneHome: state, homeDirectory: join(root, 'home') })

/** The contract the weather example of the developer handbook writes. */
const WEATHER: GuestContractData = {
  name: 'weather',
  major: 1,
  operations: {
    forecast: {
      effect: 'read',
      limit: 'small',
      body: { kind: 'object', fields: { city: { rule: { kind: 'text' } } } },
      result: { kind: 'text' },
    },
  },
}

const told = (seen: Seen): Answer | undefined => {
  if (seen.path === '/api/access/v1/scoped')
    return {
      outcome: 'succeeded',
      body: { protocols: [{ name: 'weather', major: 1, contract: WEATHER }] },
    }
  if (seen.path === '/api/weather/v1/forecast')
    return seen.body['city'] === 'Paris'
      ? { outcome: 'succeeded', body: 'sunny, 18 °C' }
      : { outcome: 'basis-unavailable', body: {} }
  return undefined
}

async function loggedIn(answer: (seen: Seen) => Answer | undefined = told) {
  const service = await startFakeService(seen => answer(seen) ?? defaultAnswer(seen))
  services.push(service)
  const result = await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  expect(result.code).toBe(0)
  return service
}

const weatherCalls = (service: FakeService) =>
  service.seen.filter(seen => seen.path.startsWith('/api/weather/'))

describe('call', () => {
  it("calls the tenant's own protocol by the contract scoped tells, and prints the answer's body", async () => {
    const service = await loggedIn()
    const called = await cli(['call', 'weather/v1', 'forecast', '--body', '{"city":"Paris"}'])
    expect([called.code, called.stdout, called.stderr]).toEqual([0, '"sunny, 18 °C"\n', ''])
    const [sent] = weatherCalls(service)
    expect(sent?.body).toEqual({ city: 'Paris' })
    expect(sent?.headers['omne-acting-tenant']).toBe(tenantText)
  })

  it('takes the body from a file after @', async () => {
    const service = await loggedIn()
    const file = join(root, 'body.json')
    writeFileSync(file, '{"city":"Paris"}')
    const called = await cli(['call', 'weather/v1', 'forecast', '--body', `@${file}`])
    expect([called.code, called.stdout]).toEqual([0, '"sunny, 18 °C"\n'])
    expect(weatherCalls(service)).toHaveLength(1)
  })

  it('maps an answer that is not a success by its outcome, as every call does', async () => {
    await loggedIn()
    const called = await cli(['call', 'weather/v1', 'forecast', '--body', '{"city":"Lima"}'])
    expect(called.code).toBe(4)
    expect(JSON.parse(called.stdout)).toMatchObject({
      result: 'response',
      outcome: 'basis-unavailable',
    })
  })

  it.each([
    [
      'a protocol the tenant does not have',
      ['call', 'notes/v1', 'list'],
      'omne call: the acting tenant has no protocol notes/v1; it has weather/v1\n',
    ],
    [
      'an operation the contract does not have',
      ['call', 'weather/v1', 'today'],
      'omne call: weather/v1 has no operation today; it has forecast\n',
    ],
    [
      'a body that does not fit the rule',
      ['call', 'weather/v1', 'forecast', '--body', '{"town":"Paris"}'],
      'omne call: the body does not fit the rule of weather/v1 forecast\n',
    ],
    [
      'a body that is not JSON',
      ['call', 'weather/v1', 'forecast', '--body', '{city'],
      'omne call: --body takes a JSON value or @<file>\n',
    ],
    [
      'a protocol not written as <name>/v<major>',
      ['call', 'weather', 'forecast'],
      'omne call: the protocol is written <name>/v<major>, such as weather/v1\n',
    ],
  ])('sends nothing for %s, and says which', async (_case, argv, said) => {
    const service = await loggedIn()
    const called = await cli(argv)
    expect([called.code, called.stdout, called.stderr]).toEqual([2, '', said])
    expect(weatherCalls(service)).toEqual([])
  })

  it('exits as a service that is not available when scoped cannot be read, and sends nothing', async () => {
    const service = await loggedIn(seen =>
      seen.path === '/api/access/v1/scoped'
        ? { outcome: 'basis-unavailable', body: {} }
        : told(seen),
    )
    const called = await cli(['call', 'weather/v1', 'forecast', '--body', '{"city":"Paris"}'])
    expect([called.code, called.stdout]).toEqual([4, ''])
    expect(called.stderr).toBe(
      'omne call: the protocols of the acting tenant cannot be read now (basis-unavailable)\n',
    )
    expect(weatherCalls(service)).toEqual([])
  })
})
