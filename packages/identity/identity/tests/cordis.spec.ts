import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { inProcessPrincipalAuthority, type TenantStandingSource } from '@omne-harness/identity'
import * as entry from '@omne-harness/identity/cordis'
import {
  PrincipalIssuerService,
  IdentityOperationsService,
  PrincipalVerifierService,
  TenantStandingSourceService,
  identityOperationsKey,
  principalIssuerKey,
  principalVerifierKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import {
  IDENTITY_CONTRACT_CASES,
  checkIdentityOperationsContract,
} from '@omne-harness/identity/testing'
import { installOperations } from './cordis-support.ts'
import { ADMIN_ACCOUNT_TEXT, ORGANIZATION_TEXT, parsedTenant } from './support.ts'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})

it('exports four service definitions and their keys from ./cordis', () => {
  expect(Object.keys(entry).sort()).toEqual(
    [
      'IdentityOperationsService',
      'PrincipalIssuerService',
      'PrincipalVerifierService',
      'TenantStandingSourceService',
      'identityOperationsKey',
      'principalIssuerKey',
      'principalVerifierKey',
      'tenantStandingKey',
    ].sort(),
  )
  expect(identityOperationsKey).toBe('identityOperations')
  expect(tenantStandingKey).toBe('tenantStanding')
  expect(principalVerifierKey).toBe('principalVerifier')
  expect(principalIssuerKey).toBe('principalIssuer')
})

it('delegates both principal forms and current standing through real services, then removes all keys', async () => {
  const authority = inProcessPrincipalAuthority()
  let reading: Awaited<ReturnType<TenantStandingSource['read']>> = {
    kind: 'not-member',
    evidence: { record: 'membership', revision: '1' },
  }
  const seen: Parameters<TenantStandingSource['read']>[0][] = []
  class Standing extends TenantStandingSourceService {
    readonly instanceToken = {}
    readonly read: TenantStandingSource['read'] = async input => {
      seen.push(input)
      return reading
    }
  }
  class Verifier extends PrincipalVerifierService {
    readonly instanceToken = {}
    readonly verify = authority.verifier.verify
  }
  class Issuer extends PrincipalIssuerService {
    readonly instanceToken = {}
    readonly issueSystem = authority.issuer.issueSystem
    readonly issueActingForTenant = authority.issuer.issueActingForTenant
  }
  const ctx = new Context()
  for (const key of [tenantStandingKey, principalVerifierKey, principalIssuerKey])
    expect(ctx.get(key)).toBeUndefined()
  let installed: [Standing, Verifier, Issuer] | undefined
  const fiber = await ctx.plugin(context => {
    installed = [new Standing(context), new Verifier(context), new Issuer(context)]
  })
  disposers.push(() => fiber.dispose())
  const standing = ctx.get(tenantStandingKey)
  const verifier = ctx.get(principalVerifierKey)
  const issuer = ctx.get(principalIssuerKey)
  expect(standing).toBeInstanceOf(Standing)
  expect(verifier).toBeInstanceOf(Verifier)
  expect(issuer).toBeInstanceOf(Issuer)
  expect(issuer).toBeInstanceOf(Service)
  if (
    !(standing instanceof Standing) ||
    !(verifier instanceof Verifier) ||
    !(issuer instanceof Issuer)
  )
    throw new Error('service missing')
  expect(installed?.[0].instanceToken === standing.instanceToken).toBe(true)
  expect(installed?.[1].instanceToken === verifier.instanceToken).toBe(true)
  expect(installed?.[2].instanceToken === issuer.instanceToken).toBe(true)
  const system = issuer.issueSystem({ component: 'controlled-test' })
  if ('failure' in system) throw new Error('fixture system rejected')
  const tenant = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
  const acting = issuer.issueActingForTenant({
    actor: system.ok,
    tenant,
    work: { owner: 'test', work: '1' },
  })
  if ('failure' in acting) throw new Error('fixture acting principal rejected')
  for (const principal of [system.ok, acting.ok]) {
    const verified = await verifier.verify(principal)
    expect(verified.kind).toBe('verified')
    if (verified.kind === 'verified') expect(verified.principal).toBe(principal)
    await expect(verifier.verify({ ...principal })).resolves.toEqual({ kind: 'rejected' })
  }
  const input = { tenant }
  expect(await standing.read(input)).toBe(reading)
  reading = { kind: 'unavailable', diagnostic: 'offline' }
  expect(await standing.read(input)).toBe(reading)
  expect(seen).toEqual([input, input])
  await fiber.dispose()
  for (const key of [tenantStandingKey, principalVerifierKey, principalIssuerKey])
    expect(ctx.get(key)).toBeUndefined()
})

it('runs every applicable operations contract case through the registered service and removes it', async () => {
  const start = parseInstant('2026-10-25T23:59:30Z')
  const short = parseDuration('PT60S')
  const long = parseDuration('PT86400S')
  if (!start.ok || !short.ok || !long.ok) throw new Error('fixture time invalid')
  const report = await checkIdentityOperationsContract(
    {
      injectsRecordFaults: true,
      async create(options) {
        const installed = await installOperations(options)
        expect(installed.operations).toBeInstanceOf(IdentityOperationsService)
        disposers.push(async () => {
          await installed.dispose()
          expect(installed.ctx.get(identityOperationsKey)).toBeUndefined()
        })
        return installed.operations
      },
    },
    { start: start.value, short: short.value, long: long.value },
  )
  expect(report.passed).toBe(true)
  expect(report.cases.filter(result => result.status === 'failed')).toEqual([])
  expect(report.cases.map(result => result.id)).toEqual(
    IDENTITY_CONTRACT_CASES.map(result => result.id),
  )
  expect(
    report.cases.filter(result => result.status === 'not-applicable').map(result => result.id),
  ).toEqual(['login-inactive-uniform'])
})
