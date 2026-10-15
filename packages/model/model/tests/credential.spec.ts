import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalCredentialPlugin } from '../src/cordis.ts'
import { deliver } from '../src/deliver.ts'
import { deliverInjected } from '../src/execute.ts'
import {
  MODEL_SEND,
  createLocalCustodian,
  credentialId,
  openLocalCustodian,
  type CredentialQuery,
  type CredentialReference,
  type SendFace,
} from '../src/index.ts'

const SECRET = 'synth-tenant-ok'
const FACTORY = 'synth-factory-ok'
const ROTATED = 'synth-rotated-new'

function identity(accountText: string, organizationText: string) {
  const account = accountCodec.parse(accountText)
  const organization = organizationCodec.parse(organizationText)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}

const tenantA = identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
const tenantB = identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')

function reference(overrides: Partial<CredentialReference> = {}): CredentialReference {
  const id = credentialId('cred-a')
  if (!id) throw new Error('fixture id')
  return { id, tenant: tenantA, purpose: MODEL_SEND, ...overrides }
}

function face(overrides: Partial<SendFace> = {}): SendFace {
  return { authorized: true, official: false, ...overrides }
}

function ordinary(value: unknown) {
  return JSON.stringify(value)
}

it('an authorized send uses the current tenant secret and leaves the call record without it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const record = { reference: ref }
  const result = deliver(record, custodian, face())
  expect(result.send).toEqual({ sent: true, value: SECRET })
  expect(result.record).toEqual({ reference: ref })
  expect(ordinary(custodian.present(ref))).not.toContain(SECRET)
  expect(ordinary(custodian.diagnostics())).not.toContain(SECRET)
})

it('cross-tenant, wrong purpose, and missing qualification do not send', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const bad: CredentialQuery = { ...ref, purpose: 'other' }
  const cases = [
    deliver({ reference: reference({ tenant: tenantB }) }, custodian, face()),
    deliver({ reference: ref }, custodian, face({ authorized: false })),
  ]
  for (const result of cases) {
    expect(result.send).toEqual({ sent: false })
  }
  const wrongPurpose = custodian.resolve(bad, face())
  expect(wrongPurpose).toEqual({ kind: 'denied' })
  expect(ordinary(wrongPurpose)).not.toContain(SECRET)
})

it('an unreadable binding does not fall back to the factory secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.markUnreadable(ref)
  const decision = custodian.resolve(ref, face({ official: true }))
  expect(decision.kind).toBe('unreadable')
  expect(custodian.present(ref)).toMatchObject({ kind: 'known', present: true })
  expect(ordinary(custodian.present(ref))).not.toContain(SECRET)
  expect(deliver({ reference: ref }, custodian, face({ official: true })).send).toEqual({
    sent: false,
  })
  expect(ordinary(decision)).not.toContain(FACTORY)
  expect(ordinary(custodian.diagnostics())).not.toContain(SECRET)
})

it('an official profile with no tenant binding uses the deployment secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const decision = custodian.resolve(reference(), face({ official: true }))
  expect(decision).toEqual({ kind: 'value', scope: 'factory', value: FACTORY })
  expect(custodian.resolve(reference(), face()).kind).toBe('absent')
})

it('a revoked tenant binding does not fall back to the factory secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  custodian.revoke(ref)
  const otherId = credentialId('cred-b')
  if (!otherId) throw new Error('fixture id')
  const decision = custodian.resolve(reference({ id: otherId }), face({ official: true }))
  expect(decision).toEqual({ kind: 'absent' })
  expect(ordinary(decision)).not.toContain(FACTORY)
  expect(ordinary(decision)).not.toContain(SECRET)
})

it('a corrupt store is unavailable and is not replaced', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  writeFileSync(path, 'not-json')
  expect(openLocalCustodian(path)).toEqual({ kind: 'unavailable' })
  expect(readFileSync(path, 'utf8')).toBe('not-json')
})

it('a missing store is unavailable, not absent', () => {
  const opened = openLocalCustodian(join(tmpdir(), 'missing-model-store.json'))
  expect(opened).toEqual({ kind: 'unavailable' })
})

it('rotation changes the next send and leaves the earlier send record', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const first = deliver({ reference: ref }, custodian, face())
  custodian.rotate(ref, ROTATED)
  const second = deliver({ reference: ref }, custodian, face())
  expect(first.send).toEqual({ sent: true, value: SECRET })
  expect(second.send).toEqual({ sent: true, value: ROTATED })
})

it('revocation rejects the next resolve and keeps the earlier send', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const sent = deliver({ reference: ref }, custodian, face())
  custodian.revoke(ref)
  const next = custodian.resolve(ref, face())
  expect(sent.send).toEqual({ sent: true, value: SECRET })
  expect(next.kind).toBe('denied')
  expect(custodian.present(ref)).toMatchObject({ kind: 'known', present: true })
})

it('another tenant cannot replace or rotate this tenant secret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const other = reference({ tenant: tenantB })
  custodian.put(other, 'from-b')
  custodian.rotate(other, 'hijack')
  expect(custodian.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(custodian.resolve(other, face())).toEqual({ kind: 'value', scope: 'tenant', value: 'hijack' })
  custodian.revoke(other)
  expect(custodian.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(custodian.resolve(other, face({ official: true }))).toEqual({ kind: 'denied' })
})

it('a purpose other than model-send is denied by present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const bad: CredentialQuery = { ...reference(), purpose: 'other' }
  expect(custodian.present(bad)).toEqual({ kind: 'denied' })
  expect(ordinary(custodian.present(bad))).not.toContain(SECRET)
})

it('a restarted process reads the current secret from the same store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const custodian = createLocalCustodian(path, FACTORY)
  const ref = reference()
  custodian.put(ref, ROTATED)
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openLocalCustodian, credentialId } from './dist/index.js'
       import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
       const opened = openLocalCustodian(${JSON.stringify(path)})
       const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
       const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
       const id = credentialId('cred-a')
       const reference = { id, tenant: tenant(organization.value, account.value), purpose: 'model-send' }
       const decision = opened.resolve(reference, { authorized: true, official: false })
       process.stdout.write(JSON.stringify({ kind: decision.kind, value: decision.value }))`,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' },
  )
  expect(child.status, child.stderr).toBe(0)
  expect(JSON.parse(child.stdout)).toEqual({ kind: 'value', value: ROTATED })
})

it('close rejects a new resolve and does not rewrite an earlier send', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const custodian = createLocalCustodian(join(dir, 'store.json'), FACTORY)
  const ref = reference()
  custodian.put(ref, SECRET)
  const sent = deliver({ reference: ref }, custodian, face())
  custodian.close()
  expect(sent.send).toEqual({ sent: true, value: SECRET })
  expect(custodian.resolve(ref, face()).kind).toBe('denied')
})

it('inject resolves the current secret and fiber disposal stops the next open', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  const seeded = createLocalCustodian(path, FACTORY)
  const ref = reference()
  seeded.put(ref, SECRET)
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await fiber
  const sent = deliverInjected(ctx, { reference: ref }, face())
  await sent.fiber
  expect(sent.outcome()).toEqual({
    record: { reference: ref },
    send: { sent: true, value: SECRET },
  })
  const first = sent.outcome()
  await fiber.dispose()
  const again = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await again
  expect(sent.outcome()).toEqual(first)
  const reopened = openLocalCustodian(path)
  if ('kind' in reopened) throw new Error('store missing after close')
  expect(reopened.resolve(ref, face())).toEqual({ kind: 'value', scope: 'tenant', value: SECRET })
  expect(readFileSync(path, 'utf8')).toContain(SECRET)
  expect(JSON.stringify(first?.record)).not.toContain(SECRET)
})

it('a corrupt store through the plugin resolves unavailable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-cred-'))
  const path = join(dir, 'store.json')
  writeFileSync(path, 'not-json')
  const ctx = new Context()
  const fiber = ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await fiber
  const ref = reference()
  const sent = deliverInjected(ctx, { reference: ref }, face())
  await sent.fiber
  expect(sent.outcome()?.send).toEqual({ sent: false })
  expect(ctx.modelCredential?.resolve(ref, face())).toEqual({ kind: 'unavailable' })
  expect(readFileSync(path, 'utf8')).toBe('not-json')
})

it('call execution does not import the store and the root does not import cordis', () => {
  const deliverSource = readFileSync(new URL('../src/deliver.ts', import.meta.url), 'utf8')
  const executeSource = readFileSync(new URL('../src/execute.ts', import.meta.url), 'utf8')
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  expect(deliverSource.includes('store.ts')).toBe(false)
  expect(executeSource.includes('store.ts')).toBe(false)
  expect(indexSource.includes('@deepseek-ai/cordis')).toBe(false)
})
