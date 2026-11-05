// The model credential management of the `model-credential` row: the admission of the acting login
// principal (`rows/authorization/model-credential-access.ts`) over the real reference admission
// check, and the custody port over a real file vault (`rows/model-credential/custody.ts`). Only the
// verifier and the standing source are doubles whose answers the test sets.
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import {
  inProcessPrincipalAuthority,
  type ActingForTenantPrincipal,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { MODEL_SEND } from '@omne-harness/model-contract/provider'
import { createLocalCredentialPlugin } from '@omne-harness/model-host-local/cordis'
import type { ModelCredentialCustody } from '@omne-harness/server-entry'
import { encodeInstant } from '@omne-harness/utc-instant'
import { afterEach, describe, expect, it } from 'vitest'
import { readSystemInstant } from '../../../src/entry/session-clock.ts'
import { tenantCredentialId } from '../../../src/model/tenant-credential.ts'
import {
  createModelCredentialGuard,
  modelCredentialAdmission,
} from '../../../src/rows/authorization/model-credential-access.ts'
import { createTenantCredentialCustody } from '../../../src/rows/model-credential/custody.ts'
import { fixtureTenant } from '../../entry/support.ts'

const SENTINEL = 'sk-or-v1-sentinel-row-4d2e'
const A = fixtureTenant('a')
const B = fixtureTenant('b')
const authority = inProcessPrincipalAuthority()
const system = (() => {
  const issued = authority.issuer.issueSystem({ component: 'server-entry' })
  if (!('ok' in issued)) throw new Error('fixture system principal')
  return issued.ok
})()

function acting(tenant: TenantId, owner = 'identity-login'): ActingForTenantPrincipal {
  const issued = authority.issuer.issueActingForTenant({
    actor: system,
    tenant,
    work: { owner, work: 'lgn_test' },
  })
  if (!('ok' in issued)) throw new Error('fixture acting principal')
  return issued.ok
}

type StandingMode = 'member' | 'not-member' | 'unavailable'
function readingOf(mode: StandingMode): TenantStandingReading {
  const evidence = { record: 'standing/test', revision: '1' }
  if (mode === 'member')
    return {
      kind: 'member',
      role: { role: 'member', model: { model: 'm', revision: '1' } },
      qualifications: [],
      evidence,
    }
  if (mode === 'not-member') return { kind: 'not-member', evidence }
  return { kind: 'unavailable', diagnostic: 'closed' }
}

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A loaded managed plugin over a real vault, the real guard, and the custody port over both. */
async function world(factorySecret = '') {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-credential-custody-')))
  directories.push(directory)
  const path = join(directory, 'vault.json')
  const flags = { standing: 'member' as StandingMode, admission: true }
  const standing: TenantStandingSource = { read: () => Promise.resolve(readingOf(flags.standing)) }
  const admission = referenceAdmissionCheck({
    verifier: authority.verifier,
    standing,
    permits: null,
  })
  const guard = createModelCredentialGuard(() => (flags.admission ? admission : undefined))
  const managed = createLocalCredentialPlugin()
  const ctx = new Context()
  const fiber = await ctx.plugin(managed.plugin, { path, factorySecret })
  const port: ModelCredentialCustody = createTenantCredentialCustody({
    custody: managed.custody,
    qualify: input => guard.qualify(input),
    now: readSystemInstant,
  })
  const service = ctx.modelCredential
  if (service?.resolveFor === undefined) throw new Error('credential service')
  const resolveFor = service.resolveFor.bind(service)
  const resolveOwn = (tenant: TenantId) => {
    const id = tenantCredentialId(tenant)
    if (id === undefined) throw new Error('tenant id')
    return resolveFor({
      id,
      purpose: MODEL_SEND,
      official: true,
      access: { principal: null, tenant },
    })
  }
  return { path, flags, port, fiber, resolveOwn }
}

describe('the admission', () => {
  it('admits only the login principal acting for the same tenant', () => {
    expect(
      modelCredentialAdmission({ principal: acting(A), tenant: A, action: 'bind' }),
    ).toMatchObject({
      operation: { owner: 'model', name: 'credential-bind' },
      target: { owner: 'model', kind: 'tenant-credential' },
      requires: [],
      permit: null,
    })
    expect(modelCredentialAdmission({ principal: acting(A), tenant: B, action: 'bind' })).toBe(
      undefined,
    )
    expect(
      modelCredentialAdmission({ principal: acting(A, 'session'), tenant: A, action: 'bind' }),
    ).toBe(undefined)
    expect(modelCredentialAdmission({ principal: system, tenant: A, action: 'describe' })).toBe(
      undefined,
    )
    expect(
      modelCredentialAdmission({ principal: { ...acting(A) }, tenant: A, action: 'bind' }),
    ).toBeDefined()
  })
})

describe('the custody port', () => {
  it('binds, shows and unbinds the acting tenant credential, and the send reads it', async () => {
    const { port, resolveOwn, fiber, path } = await world()
    const access = { principal: acting(A), tenant: A }
    const bound = await port.bind({ access, secret: SENTINEL })
    expect(bound.kind).toBe('succeeded')
    expect(resolveOwn(A)).toEqual({ kind: 'value', scope: 'tenant', value: SENTINEL })
    const shown = await port.describe({ access })
    expect(shown).toMatchObject({ kind: 'succeeded', credential: { state: 'usable', tenantId: A } })
    if (
      shown.kind === 'succeeded' &&
      shown.credential.state !== 'unbound' &&
      bound.kind === 'succeeded'
    )
      expect(encodeInstant(shown.credential.configuredAt ?? bound.configuredAt)).toBe(
        encodeInstant(bound.configuredAt),
      )
    // Nothing the caller sees carries the secret.
    expect(JSON.stringify({ bound: bound.kind, shown: shown.kind })).not.toContain(SENTINEL)
    expect(await port.unbind({ access })).toEqual({ kind: 'succeeded' })
    expect(resolveOwn(A)).toEqual({ kind: 'absent' })
    expect(await port.unbind({ access })).toEqual({ kind: 'no-change' })
    expect(await port.describe({ access })).toEqual({
      kind: 'succeeded',
      credential: { state: 'unbound' },
    })
    expect(readFileSync(path, 'utf8')).not.toContain(SENTINEL)
    await fiber.dispose()
  })

  it('another tenant, a work principal and a forged principal are denied before the vault', async () => {
    const { port, path, fiber } = await world()
    await port.bind({ access: { principal: acting(B), tenant: B }, secret: 'bob-own-secret' })
    const before = readFileSync(path, 'utf8')
    const refused = [
      { principal: acting(A), tenant: B },
      { principal: acting(B, 'session'), tenant: B },
      { principal: { ...acting(B) }, tenant: B },
    ]
    for (const access of refused) {
      expect(await port.bind({ access, secret: SENTINEL })).toEqual({ kind: 'denied' })
      expect(await port.unbind({ access })).toEqual({ kind: 'denied' })
      expect(await port.describe({ access })).toEqual({ kind: 'denied' })
    }
    expect(readFileSync(path, 'utf8')).toBe(before)
    await fiber.dispose()
  })

  it('a tenant that is not a member is denied; an unknown standing is basis-unavailable', async () => {
    const { port, flags, path, fiber } = await world()
    const access = { principal: acting(A), tenant: A }
    const before = readFileSync(path, 'utf8')
    flags.standing = 'not-member'
    expect(await port.bind({ access, secret: SENTINEL })).toEqual({ kind: 'denied' })
    flags.standing = 'unavailable'
    expect(await port.bind({ access, secret: SENTINEL })).toEqual({ kind: 'basis-unavailable' })
    flags.standing = 'member'
    flags.admission = false
    expect(await port.describe({ access })).toEqual({ kind: 'basis-unavailable' })
    expect(readFileSync(path, 'utf8')).toBe(before)
    await fiber.dispose()
  })

  it('an unreadable vault answers basis-unavailable and keeps its bytes', async () => {
    const { port, path, fiber } = await world()
    writeFileSync(path, 'not-json')
    const access = { principal: acting(A), tenant: A }
    expect(await port.bind({ access, secret: SENTINEL })).toEqual({ kind: 'basis-unavailable' })
    expect(await port.unbind({ access })).toEqual({ kind: 'basis-unavailable' })
    expect(await port.describe({ access })).toEqual({ kind: 'basis-unavailable' })
    expect(readFileSync(path, 'utf8')).toBe('not-json')
    await fiber.dispose()
  })

  it('after the plugin unloads a write is basis-unavailable', async () => {
    const { port, fiber } = await world()
    await fiber.dispose()
    const access = { principal: acting(A), tenant: A }
    expect(await port.bind({ access, secret: SENTINEL })).toEqual({ kind: 'basis-unavailable' })
  })

  it('a host clock that cannot be read writes nothing', async () => {
    const { path, fiber } = await world()
    const managed = createLocalCredentialPlugin()
    const port = createTenantCredentialCustody({
      custody: managed.custody,
      qualify: async () => ({ kind: 'allowed' }),
      now: () => ({ ok: false, failure: { kind: 'syntax' } }),
    })
    const before = readFileSync(path, 'utf8')
    expect(
      await port.bind({ access: { principal: acting(A), tenant: A }, secret: SENTINEL }),
    ).toEqual({ kind: 'basis-unavailable' })
    expect(readFileSync(path, 'utf8')).toBe(before)
    await fiber.dispose()
  })
})
