import { expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { credentialBinding } from '../../../src/rows/mcp/credential.ts'
import {
  createEndpointAdoption,
  programCallsOpen,
  type CredentialPresence,
  type EndpointFacts,
} from '../../../src/rows/mcp/endpoints.ts'

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

const home = tenantOf('s')
const text = (value: string) => ({ kind: 'string', value })
const ref = { name: 'docs', holding: 'held-docs' } as unknown as EndpointRef

function factsWith(
  presence: () => Outcome<CredentialPresence, 'unknown'>,
  auth: 'static' | 'oauth' = 'static',
): EndpointFacts {
  const held = {
    kind: 'holding',
    holding: {
      name: 'docs',
      holdingRef: 'held-docs',
      revision: '1',
      ownerRevision: '1',
      enabled: true,
      state: 'held',
    },
    selected: {
      version: 'v1',
      ownerRevision: '1',
      body: {
        kind: 'object',
        entries: [
          { key: 'name', value: text('docs') },
          { key: 'transport', value: text('streamable-http') },
          { key: 'auth', value: text(auth) },
        ],
      },
    },
  }
  return {
    assets: async () =>
      ({
        readHeldCapability: async () => held,
        listHeld: async () => ({ kind: 'page', items: [], next: null }),
      }) as never,
    settings: async () =>
      new Map([
        ['target', { kind: 'set', value: 'https://peer.example/mcp', revision: '2' }],
        ['connect-timeout', { kind: 'unset', revision: '0' }],
        ['credential', { kind: 'secret', revision: '0' }],
        ['client-id', { kind: 'unset', revision: '0' }],
      ]),
    credential: async () => presence(),
  }
}

it('a secured endpoint adopts its credential once one is kept, and its revision moves with it', async () => {
  let presence: CredentialPresence = { bound: false, revision: 'unbound' }
  const adoption = createEndpointAdoption(factsWith(() => succeed(presence)))
  const asker = { principal: null, tenant: home }
  const before = await adoption.endpoint(asker, ref)
  if (!('ok' in before) || before.ok === 'not-adopted') throw new Error(JSON.stringify(before))
  expect(before.ok.settings.credential).toEqual({ kind: 'absent' })

  presence = { bound: true, revision: '2026-11-23T15:00:00Z' }
  const after = await adoption.endpoint(asker, ref)
  if (!('ok' in after) || after.ok === 'not-adopted') throw new Error(JSON.stringify(after))
  expect(after.ok.settings.credential).toEqual({
    kind: 'value',
    value: credentialBinding('held-docs', 'docs'),
  })
  expect(after.ok.revision).not.toBe(before.ok.revision)
})

it('an OAuth endpoint always hands MCP the binding of its grant; the credential a person types is not asked (C204)', async () => {
  const adoption = createEndpointAdoption(
    factsWith(() => {
      throw new Error('the typed credential is not asked')
    }, 'oauth'),
  )
  const adopted = await adoption.endpoint({ principal: null, tenant: home }, ref)
  if (!('ok' in adopted) || adopted.ok === 'not-adopted') throw new Error(JSON.stringify(adopted))
  expect(adopted.ok.settings.credential).toEqual({
    kind: 'value',
    value: credentialBinding('held-docs', 'docs', 'oauth'),
  })
})

it('an endpoint whose credential cannot be told is not known, not adopted without it', async () => {
  const adoption = createEndpointAdoption(factsWith(() => fail('unknown')))
  expect(await adoption.endpoint({ principal: null, tenant: home }, ref)).toEqual(fail('unknown'))
})

// MC-26: program calls are open only when the holder set them to true; anything else is not open.
it.each([
  ['set to true', new Map([['program-calls', { kind: 'set', value: true, revision: '3' }]]), true],
  [
    'set to false',
    new Map([['program-calls', { kind: 'set', value: false, revision: '3' }]]),
    false,
  ],
  [
    'set to a text',
    new Map([['program-calls', { kind: 'set', value: 'true', revision: '3' }]]),
    false,
  ],
  ['not set', new Map([['program-calls', { kind: 'unset', revision: '0' }]]), false],
  ['not among the settings', new Map(), false],
  ['not readable', 'unknown', false],
] as const)('program calls of an endpoint whose setting is %s', async (_state, items, open) => {
  const settings = (async () => items) as EndpointFacts['settings']
  expect(await programCallsOpen({ settings }, home, 'docs')).toBe(open)
})
