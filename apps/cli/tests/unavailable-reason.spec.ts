import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTenantText } from '@omne-harness/public-contract'
import { createHttpProtocolTransport, type Credentials } from '@omne-harness/sdk/core'
import { usageProtocol } from '@omne-harness/usage-protocol'
import { openLink } from '../src/link.ts'
import {
  NOT_OFFERED,
  defaultAnswer,
  startFakeService,
  streamAnswer,
  tenantText,
  type Answer,
  type FakeService,
  type Seen,
} from './support/fake-service.ts'
import { runInProcess } from './support/in-process.ts'

let root: string
const services: FakeService[] = []
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-reason-')))
})
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  rmSync(root, { recursive: true, force: true })
})

const SESSION = 'a'.repeat(64)
const served = (name: string, major: number) => ({ name, major, revision: 1, digest: 'sha256:0' })
const frame = (protocols: object[], conflicts: object[] = []) => ({
  kind: 'snapshot',
  revision: 1,
  protocols,
  conflicts,
})

/** A server that does not offer the usage protocol, and tells this of what it serves. */
async function withoutUsage(availability: Answer) {
  const service = await startFakeService((seen: Seen) => {
    if (seen.path.startsWith('/api/usage/')) return NOT_OFFERED
    if (seen.path === '/api/access/v1/availability') return availability
    return defaultAnswer(seen)
  })
  services.push(service)
  const home = { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') }
  const cli = (argv: readonly string[]) => runInProcess(argv, home)
  await cli(['login', '--login-identifier', 'alice', '--server', service.origin])
  const asked = () => service.seen.filter(seen => seen.path === '/api/access/v1/availability')
  return { service, cli, asked }
}

const occupancy = ['read-context-occupancy', '--session', SESSION]

describe('a command whose protocol the server does not serve', () => {
  it('says on standard error which protocol and that the server does not serve it; output and exit code are as before', async () => {
    const t = await withoutUsage(streamAnswer([frame([served('access', 1)])], 'aborted'))
    const result = await t.cli(occupancy)
    expect(result.code).toBe(4)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'unavailable' })
    expect(Object.keys(JSON.parse(result.stdout) as object).sort()).toEqual(['request', 'result'])
    expect(result.stderr).toBe('omne read-context-occupancy: the server does not serve usage/v1\n')
    expect(t.asked()).toHaveLength(1)
  })

  it('says the major the server serves instead', async () => {
    const t = await withoutUsage(
      streamAnswer([frame([served('access', 1), served('usage', 2)])], 'aborted'),
    )
    const result = await t.cli(occupancy)
    expect(result.code).toBe(4)
    expect(result.stderr).toBe(
      'omne read-context-occupancy: the server serves usage/v2, this command speaks usage/v1\n',
    )
  })

  it('says that two parts of the server claim it', async () => {
    const t = await withoutUsage(
      streamAnswer([frame([served('access', 1)], [{ name: 'usage', major: 1 }])], 'aborted'),
    )
    const result = await t.cli(occupancy)
    expect(result.code).toBe(4)
    expect(result.stderr).toBe(
      'omne read-context-occupancy: two parts of the server claim usage/v1, neither is served\n',
    )
  })

  it('says nothing more when the server serves the protocol: the call was not run for another reason', async () => {
    const t = await withoutUsage(
      streamAnswer([frame([served('access', 1), served('usage', 1)])], 'aborted'),
    )
    const result = await t.cli(occupancy)
    expect(result.code).toBe(4)
    expect(result.stderr).toBe('')
  })

  it('asks what the server serves once a run, however many calls were not run', async () => {
    const t = await withoutUsage(streamAnswer([frame([served('access', 1)])], 'aborted'))
    const opened = openLink(
      {
        services: {
          createTransport: (origin: string, credentials: () => Credentials) =>
            createHttpProtocolTransport({ origin, credentials }),
          newId: () => 'id-reason',
        },
      } as never,
      t.service.origin,
    )
    if (opened.kind !== 'link') throw new Error('the link was refused')
    const tenant = readTenantText(tenantText)
    if (tenant === undefined) throw new Error('the tenant text does not read')
    const body = { tenant, session: SESSION }
    const first = await opened.link.call(usageProtocol, 'read-context-occupancy', body, 'm-1')
    const second = await opened.link.call(usageProtocol, 'read-context-occupancy', body, 'm-2')
    expect([first, second]).toEqual([
      { kind: 'unavailable', reason: 'the server does not serve usage/v1' },
      { kind: 'unavailable', reason: 'the server does not serve usage/v1' },
    ])
    expect(t.asked()).toHaveLength(1)
  })

  it('says nothing more when the server does not tell what it serves', async () => {
    const t = await withoutUsage(NOT_OFFERED)
    const result = await t.cli(occupancy)
    expect(result.code).toBe(4)
    expect(JSON.parse(result.stdout)).toMatchObject({ result: 'unavailable' })
    expect(result.stderr).toBe('')
  })
})

describe('a command that is answered', () => {
  it('never asks what the server serves', async () => {
    const service = await startFakeService()
    services.push(service)
    const home = { omneHome: join(root, 'state'), homeDirectory: join(root, 'home') }
    await runInProcess(['login', '--login-identifier', 'alice', '--server', service.origin], home)
    expect((await runInProcess(occupancy, home)).code).not.toBe(2)
    expect(service.seen.filter(seen => seen.path.startsWith('/api/access/'))).toEqual([])
  })
})
