// R3 的主体权威（DP1-C17、DP5-C1、表 3-3）：核验器只认本权威签发的主体，系统主体对十行矩阵的裁定，
// 入口对象是定义的子类，签发者不被模块对象持有。用例经服务键与 `referenceSystemActionAuthorization` 调用。
import { describe, expect, it } from 'vitest'
import {
  SYSTEM_ACTION_MATRIX,
  noArguments,
  referenceAdmissionCheck,
  referenceSystemActionAuthorization,
  type SystemActionRequest,
  type SystemActionRow,
} from '@omne-harness/authorization'
import type { Principal, SystemPrincipal, TenantStandingSource } from '@omne-harness/identity'
import {
  PrincipalIssuerService,
  PrincipalVerifierService,
  principalIssuerKey,
  principalVerifierKey,
} from '@omne-harness/identity/cordis'
import {
  SessionInternalPrincipalsService,
  sessionPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  AGENT_HOST_COMPONENT,
  MAINTENANCE_GRANTS,
  TOOL_RESIDENCY_COMPONENT,
  releaseMaintenanceGrants,
} from '../../src/rows/authorization/index.ts'
import {
  ENTRY_COMPONENTS,
  principalIssuer,
  principalVerifier,
  sessionPrincipals,
  sessionWorkIssuerOf,
  verifierOf,
} from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got, heldValues, principalOf } from './support.ts'

const TRUSTED = [principalIssuerKey]

async function installed() {
  const fixture = fixtureEnv(TRUSTED)
  await fixture.install(principalVerifier)
  await fixture.install(principalIssuer)
  await fixture.install(sessionPrincipals)
  const verifier = got(fixture.root.get(principalVerifierKey), 'principalVerifier')
  const issuer = got(fixture.scopeOf(principalIssuerKey).get(principalIssuerKey), 'principalIssuer')
  const service = got(fixture.root.get(sessionPrincipalsKey), 'sessionPrincipals')
  const principals = {
    service,
    coordinator: principalOf(service.coordinator),
    maintainer: principalOf(service.maintainer),
  }
  return { fixture, verifier, issuer, principals }
}

function systemOf(issuer: PrincipalIssuerService, component: string): SystemPrincipal {
  const issued = issuer.issueSystem({ component })
  if ('failure' in issued) throw new Error('fixture principal did not issue')
  return issued.ok
}

describe('the verifier view (验收 1)', () => {
  it('verifies the very principal the issuer issued and rejects a hand-built copy of the same shape', async () => {
    const { verifier, issuer } = await installed()
    const issued = systemOf(issuer, 'probe')
    await expect(verifier.verify(issued)).resolves.toEqual({ kind: 'verified', principal: issued })
    const copy: SystemPrincipal = { kind: 'system', component: 'probe' }
    await expect(verifier.verify(copy)).resolves.toEqual({ kind: 'rejected' })
    await expect(verifier.verify(JSON.parse(JSON.stringify(issued)))).resolves.toEqual({
      kind: 'rejected',
    })
  })

  it('is the authority of this run: verifierOf(env) and the installed service judge alike, another env does not', async () => {
    const { fixture, verifier, issuer } = await installed()
    const issued = systemOf(issuer, 'probe')
    await expect(verifierOf(fixture.env).verify(issued)).resolves.toMatchObject({
      kind: 'verified',
    })
    const other = fixtureEnv(TRUSTED)
    await expect(verifierOf(other.env).verify(issued)).resolves.toEqual({ kind: 'rejected' })
    await expect(verifier.verify(issued)).resolves.toMatchObject({ kind: 'verified' })
  })

  it('answers untrusted-principal through the authorization conformance path for a forged system principal', async () => {
    const { fixture } = await installed()
    let reads = 0
    const grants = releaseMaintenanceGrants()
    const authorization = referenceSystemActionAuthorization({
      verifier: verifierOf(fixture.env),
      grants: {
        read: input => {
          reads += 1
          return grants.read(input)
        },
      },
      clock: null,
    })
    const forged: SystemPrincipal = { kind: 'system', component: TOOL_RESIDENCY_COMPONENT }
    await expect(
      authorization.check(requestFor(rowOf('resident-references'), forged)),
    ).resolves.toMatchObject({
      kind: 'denied',
      reason: 'untrusted-principal',
    })
    expect(reads).toBe(0)
  })

  it('serves the reference admission check (AU-11) as its verifier: a forged acting principal is denied before standing is read', async () => {
    const { fixture } = await installed()
    let reads = 0
    const standing: TenantStandingSource = {
      read: () => {
        reads += 1
        return Promise.resolve({ kind: 'unavailable', diagnostic: 'not reached in this case' })
      },
    }
    const check = referenceAdmissionCheck({
      verifier: verifierOf(fixture.env),
      standing,
      permits: null,
    })
    const tenant = fixtureTenant('a')
    const forged: Principal = {
      kind: 'acting-for-tenant',
      actor: { kind: 'system', component: 'server-entry' },
      tenant,
      work: { owner: 'identity-login', work: 'lgs_x' },
    }
    await expect(
      check.check({
        access: { principal: forged, tenant },
        operation: { owner: 'session', name: 'create' },
        target: { owner: 'session', kind: 'session', key: 'ses_1' },
        arguments: noArguments(),
        requires: [],
        permit: null,
      }),
    ).resolves.toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
    expect(reads).toBe(0)
  })
})

function rowOf(purpose: string): SystemActionRow {
  const row = SYSTEM_ACTION_MATRIX.find(entry => entry.purpose === purpose)
  if (row === undefined) throw new Error(`no matrix row ${purpose}`)
  return row
}

function requestFor(row: SystemActionRow, principal: SystemPrincipal): SystemActionRequest {
  const target =
    row.target === 'system'
      ? ({ kind: 'system', resource: { ...row.resource, key: 'k' } } as const)
      : ({
          kind: 'tenant',
          tenant: fixtureTenant('a'),
          resource: { ...row.resource, key: 'k' },
        } as const)
  return {
    principal,
    scope: 'system',
    operation: row.operation,
    target,
    arguments: row.arguments === 'none' ? noArguments() : { digest: 'sha256:0' },
  }
}

describe('system principals against the ten-row matrix with the release grant table (验收 2)', () => {
  const holderOf = new Map<string, string>(
    Object.entries(MAINTENANCE_GRANTS).flatMap(([component, grant]) =>
      grant.purposes.map(purpose => [purpose, component] as const),
    ),
  )

  it('covers all ten rows: the holder of a row is allowed, every other issued system principal is denied grant-missing', async () => {
    const { fixture, issuer, principals } = await installed()
    const authorization = referenceSystemActionAuthorization({
      verifier: verifierOf(fixture.env),
      grants: releaseMaintenanceGrants(),
      clock: null,
    })
    const holders = {
      [TOOL_RESIDENCY_COMPONENT]: systemOf(issuer, TOOL_RESIDENCY_COMPONENT),
      [AGENT_HOST_COMPONENT]: systemOf(issuer, AGENT_HOST_COMPONENT),
    }
    const outsiders: Principal[] = [
      principals.coordinator,
      principals.maintainer,
      systemOf(issuer, 'restart-scanner'),
    ]
    expect(SYSTEM_ACTION_MATRIX).toHaveLength(10)
    for (const row of SYSTEM_ACTION_MATRIX) {
      const holder = holderOf.get(row.purpose)
      for (const [component, principal] of Object.entries(holders)) {
        const decision = await authorization.check(requestFor(row, principal))
        if (component === holder)
          expect(decision, `${component} on ${row.purpose}`).toMatchObject({
            kind: 'allowed',
            basis: { grant: { record: `maintenance-grant/${component}` } },
          })
        else
          expect(decision, `${component} on ${row.purpose}`).toMatchObject({
            kind: 'denied',
            reason: 'grant-missing',
          })
      }
      for (const outsider of outsiders) {
        if (outsider.kind !== 'system')
          throw new Error('entry session principals are system principals')
        await expect(authorization.check(requestFor(row, outsider))).resolves.toMatchObject({
          kind: 'denied',
          reason: 'grant-missing',
        })
      }
    }
  })

  it('denies an action outside the matrix with operation-forbidden and never reads the table', async () => {
    const { fixture, issuer } = await installed()
    let reads = 0
    const grants = releaseMaintenanceGrants()
    const authorization = referenceSystemActionAuthorization({
      verifier: verifierOf(fixture.env),
      grants: {
        read: input => {
          reads += 1
          return grants.read(input)
        },
      },
      clock: null,
    })
    const host = systemOf(issuer, AGENT_HOST_COMPONENT)
    await expect(
      authorization.check({
        principal: host,
        scope: 'system',
        operation: { owner: 'agent', name: 'erase' },
        target: {
          kind: 'tenant',
          tenant: fixtureTenant('a'),
          resource: { owner: 'agent', kind: 'instance', key: 'k' },
        },
        arguments: noArguments(),
      }),
    ).resolves.toMatchObject({ kind: 'denied', reason: 'operation-forbidden' })
    expect(reads).toBe(0)
  })

  it('issues each entry system principal with exactly one component of table 3-3, as distinct objects', async () => {
    const { fixture, principals } = await installed()
    expect(principals.coordinator).toEqual({
      kind: 'system',
      component: ENTRY_COMPONENTS.sessionCoordinator,
    })
    expect(principals.maintainer).toEqual({
      kind: 'system',
      component: ENTRY_COMPONENTS.sessionMaintainer,
    })
    expect(principals.coordinator).not.toBe(principals.maintainer)
    expect(Object.values(ENTRY_COMPONENTS).sort()).toEqual([
      'sessionPrincipals.coordinator',
      'sessionPrincipals.maintainer',
      'sessionWorkPrincipals',
    ])
    const verifier = verifierOf(fixture.env)
    await expect(verifier.verify(principals.coordinator)).resolves.toMatchObject({
      kind: 'verified',
    })
    await expect(verifier.verify(principals.maintainer)).resolves.toMatchObject({
      kind: 'verified',
    })
    expect(Object.isFrozen(principals.coordinator)).toBe(true)
  })

  it('the session work issuing view issues acting principals whose actor is the sessionWorkPrincipals component, and nothing else', async () => {
    const { fixture } = await installed()
    const issue = sessionWorkIssuerOf(fixture.env)
    const tenant = fixtureTenant('a')
    const issued = issue({ tenant, session: 'ses_1' })
    if ('failure' in issued) throw new Error('work principal did not issue')
    expect(issued.ok).toMatchObject({
      kind: 'acting-for-tenant',
      actor: { kind: 'system', component: ENTRY_COMPONENTS.sessionWork },
      tenant,
      work: { owner: 'session', work: 'ses_1' },
    })
    await expect(verifierOf(fixture.env).verify(issued.ok)).resolves.toMatchObject({
      kind: 'verified',
    })
    await expect(verifierOf(fixture.env).verify(issued.ok.actor)).resolves.toMatchObject({
      kind: 'verified',
    })
    expect(Object.keys(issue)).toEqual([])
    expect(issue({ tenant, session: '' })).toMatchObject({
      failure: { field: 'work.work', reason: 'empty' },
    })
  })
})

describe('installation shape (DP1-C11, 验收 5)', () => {
  it('constructs the service definitions of identity and session-contract, the issuer only in its own scope', async () => {
    const { fixture, verifier, issuer, principals } = await installed()
    expect(verifier).toBeInstanceOf(PrincipalVerifierService)
    expect(issuer).toBeInstanceOf(PrincipalIssuerService)
    expect(principals.service).toBeInstanceOf(SessionInternalPrincipalsService)
    expect(fixture.root.get(principalIssuerKey)).toBeUndefined()
    expect(principalIssuer).toMatchObject({ name: 'principalIssuer', implementation: 'real' })
    expect(principalVerifier).toMatchObject({ name: 'principalVerifier', implementation: 'real' })
    expect(sessionPrincipals).toMatchObject({ name: 'sessionPrincipals', implementation: 'real' })
  })

  it('does not hold the issuer or the authority on the module objects or the verifier service', async () => {
    const { fixture, verifier, issuer, principals } = await installed()
    const held = new Set([
      ...heldValues(principalVerifier),
      ...heldValues(principalIssuer),
      ...heldValues(sessionPrincipals),
      ...heldValues(principals.service),
      ...heldValues(verifier),
    ])
    expect(held.has(issuer.issueSystem)).toBe(false)
    expect(held.has(issuer.issueActingForTenant)).toBe(false)
    expect(JSON.stringify({ principalVerifier, principalIssuer, sessionPrincipals })).not.toMatch(
      /issueSystem|issueActingForTenant|authority/u,
    )
    expect(fixture.env.stateRoot).toBe('fixture-state-root')
  })

  it('shares one authority per run across the three modules, whatever the install order (DP1-C17)', async () => {
    const fixture = fixtureEnv(TRUSTED)
    await fixture.install(sessionPrincipals)
    await fixture.install(principalIssuer)
    await fixture.install(principalVerifier)
    const principals = got(fixture.root.get(sessionPrincipalsKey), 'sessionPrincipals')
    const verifier = got(fixture.root.get(principalVerifierKey), 'principalVerifier')
    const issuer = got(
      fixture.scopeOf(principalIssuerKey).get(principalIssuerKey),
      'principalIssuer',
    )
    await expect(verifier.verify(principals.maintainer)).resolves.toMatchObject({
      kind: 'verified',
    })
    await expect(verifier.verify(systemOf(issuer, 'probe'))).resolves.toMatchObject({
      kind: 'verified',
    })
  })
})
