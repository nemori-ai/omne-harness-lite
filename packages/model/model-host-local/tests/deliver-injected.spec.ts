import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
  type SendFace,
} from '@omne-harness/model-contract'
import {
  ModelCredentialService,
  modelCredentialKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { expect, it } from 'vitest'
import { LocalCredentialPlugin, deliverInjected } from '../src/cordis.ts'
import { createLocalCustodian, openLocalCustodian } from '../src/index.ts'

const FACTORY = 'synth-factory'
const SECRET = 'synth-local-secret'
const REPLACEMENT_SECRET = 'synth-replacement-secret'

function seededReference(): CredentialReference {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const id = decodeCredentialId('cred-a')
  if (!account.ok || !organization.ok || !('ok' in id)) throw new Error('fixture identity')
  return { id: id.ok, tenant: tenant(organization.value, account.value), purpose: MODEL_SEND }
}

const face: SendFace = { authorized: true, official: false }

function seededStore(reference: CredentialReference): string {
  const path = join(mkdtempSync(join(tmpdir(), 'model-host-local-')), 'store.json')
  const seeded = createLocalCustodian({ path, factorySecret: FACTORY })
  seeded.put(reference, SECRET)
  seeded.close()
  return path
}

// Cordis settles a fiber when its injection callback has run once, or never when nothing provides
// the service. A bounded wait tells those two apart without hanging the suite.
async function settle(fiber: PromiseLike<unknown>) {
  await Promise.race([fiber, new Promise(resolve => setTimeout(resolve, 100))])
}

class ReplacementProvider extends ModelCredentialService {
  readonly present = () => ({ kind: 'unavailable' as const })
  readonly resolve = () => ({
    kind: 'value' as const,
    scope: 'tenant' as const,
    value: REPLACEMENT_SECRET,
  })
}

// The model side of this boundary is held by the dependency direction: model does not depend on
// this member, so `lint:deps` reports any import of the custodian modules from there as a cycle.
it('the injected delivery stays clear of the custodian modules', () => {
  const source = readFileSync(new URL('../src/deliver-injected.ts', import.meta.url), 'utf8')
  for (const forbidden of ['store.ts', 'records.ts']) {
    expect(source.includes(forbidden), forbidden).toBe(false)
  }
})

it('with no provider an injected send resolves nothing and waits instead of reporting a value', async () => {
  const ctx = new Context()
  const sent = deliverInjected(ctx, { reference: seededReference() }, face)
  await settle(sent.fiber)
  expect(sent.outcome()).toBeUndefined()
  expect(ctx.modelCredential).toBeUndefined()
})

it('a send started before any provider is installed completes once the plugin appears', async () => {
  const reference = seededReference()
  const path = seededStore(reference)
  const ctx = new Context()
  const sent = deliverInjected(ctx, { reference }, face)
  await settle(sent.fiber)
  expect(sent.outcome()).toBeUndefined()

  const plugin = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await sent.fiber
  expect(sent.outcome()?.send).toEqual({ sent: true, value: SECRET })
  await plugin.dispose()
})

it('after the plugin is disposed and installed again a new injected send gets the value', async () => {
  const reference = seededReference()
  const path = seededStore(reference)
  const ctx = new Context()
  const first = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await first.dispose()

  const during = deliverInjected(ctx, { reference }, face)
  await settle(during.fiber)
  expect(during.outcome()).toBeUndefined()

  const second = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  const after = deliverInjected(ctx, { reference }, face)
  await after.fiber
  expect(after.outcome()?.send).toEqual({ sent: true, value: SECRET })
  await second.dispose()
})

it('a result once produced stays when the provider is installed again over a rotated secret', async () => {
  const reference = seededReference()
  const path = seededStore(reference)
  const ctx = new Context()
  const first = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  const sent = deliverInjected(ctx, { reference }, face)
  await sent.fiber
  const produced = sent.outcome()
  expect(produced?.send).toEqual({ sent: true, value: SECRET })
  await first.dispose()

  const opened = openLocalCustodian({ path })
  if (opened.kind !== 'open') throw new Error('store missing')
  opened.custodian.rotate(reference, REPLACEMENT_SECRET)
  const second = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await settle(sent.fiber)

  expect(ctx.modelCredential?.resolve(reference, face)).toEqual({
    kind: 'value',
    scope: 'tenant',
    value: REPLACEMENT_SECRET,
  })
  expect(sent.outcome()).toEqual(produced)
  expect(sent.outcome()?.send).toEqual({ sent: true, value: SECRET })
  await second.dispose()
})

it('a second provider cannot register beside the live one and the live one keeps serving', async () => {
  const reference = seededReference()
  const path = seededStore(reference)
  const ctx = new Context()
  const local = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })

  // Cordis fibers are thenables that Vitest's matchers probe as injected values, so wrap the await.
  const second = (async () => {
    await ctx.plugin(ReplacementProvider)
  })()
  await expect(second).rejects.toThrow(/modelCredential.*registered/)
  expect(ctx.modelCredential).toBeInstanceOf(LocalCredentialPlugin)

  const sent = deliverInjected(ctx, { reference }, face)
  await sent.fiber
  expect(sent.outcome()?.send).toEqual({ sent: true, value: SECRET })
  await local.dispose()
})

it('replacing the plugin with another service subclass moves later sends to the successor', async () => {
  const reference = seededReference()
  const path = seededStore(reference)
  const ctx = new Context()
  const local = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: FACTORY })
  await local.dispose()
  const replacement = await ctx.plugin(ReplacementProvider)
  expect(ctx.modelCredential).toBeInstanceOf(ReplacementProvider)

  const sent = deliverInjected(ctx, { reference }, face)
  await sent.fiber
  expect(sent.outcome()?.send).toEqual({ sent: true, value: REPLACEMENT_SECRET })

  await local.dispose()
  expect(ctx.modelCredential).toBeInstanceOf(ReplacementProvider)
  const later = deliverInjected(ctx, { reference }, face)
  await later.fiber
  expect(later.outcome()?.send).toEqual({ sent: true, value: REPLACEMENT_SECRET })
  await replacement.dispose()
})

it('an object injected under modelCredential that is not a service subclass sends nothing', async () => {
  const reference = seededReference()
  const ctx = new Context()
  const forged = {
    present: () => ({ kind: 'unavailable' as const }),
    resolve: () => ({ kind: 'value' as const, scope: 'tenant' as const, value: 'forged-secret' }),
  }
  ctx.provide(modelCredentialKey)
  ctx.set(modelCredentialKey, forged)

  const sent = deliverInjected(ctx, { reference }, face)
  await sent.fiber
  expect(sent.outcome()).toEqual({ record: { reference }, send: { sent: false } })
})
