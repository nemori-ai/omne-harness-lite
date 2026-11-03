import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  catalogKeyOf,
  connectionKeyOf,
  isAdoptionRevision,
  isCredentialBinding,
  isEndpointHolding,
  isEndpointName,
  peerAccountOf,
  type AdoptionRevision,
  type CredentialBinding,
  type PeerAccount,
} from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import { json } from './json.ts'

function tenantOf(body: string): TenantId {
  const organization = organizationCodec.parse(`org_${body}`)
  const account = accountCodec.parse(`acc_${body}`)
  if (!organization.ok || !account.ok) throw new Error('bad tenant')
  return tenant(organization.value, account.value)
}

function binding(text: string): CredentialBinding {
  if (!isCredentialBinding(text)) throw new Error('bad binding')
  return text
}

function revision(text: string): AdoptionRevision {
  if (!isAdoptionRevision(text)) throw new Error('bad revision')
  return text
}

function endpoint(adoption: AdoptionRevision): AdoptedEndpoint {
  const name = 'files'
  const holding = 'tenant/files'
  if (!isEndpointName(name) || !isEndpointHolding(holding)) throw new Error('bad ref')
  return {
    ref: { name, holding },
    revision: adoption,
    body: json({ name: 'files', transport: 'streamable-http', auth: 'oauth' }),
    settings: {},
    processEnv: [],
  }
}

const first = tenantOf('0123456789abcdefghjkmnpqrs')
const second = tenantOf('0123456789abcdefghjkmnpqrt')
const alice: PeerAccount = { kind: 'credential', binding: binding('alice') }
const bob: PeerAccount = { kind: 'credential', binding: binding('bob') }

describe('peerAccountOf', () => {
  it('is anonymous without authentication, whatever binding is given', () => {
    expect(peerAccountOf('none', undefined)).toEqual({ ok: { kind: 'anonymous' } })
    expect(peerAccountOf('none', binding('alice'))).toEqual({ ok: { kind: 'anonymous' } })
  })

  it('is the bound credential with authentication', () => {
    expect(peerAccountOf('static', binding('alice'))).toEqual({ ok: alice })
    expect(peerAccountOf('oauth', binding('bob'))).toEqual({ ok: bob })
  })

  it('reports a missing credential instead of falling back to another account', () => {
    expect(peerAccountOf('static', undefined)).toEqual({ failure: 'credential-missing' })
    expect(peerAccountOf('oauth', undefined)).toEqual({ failure: 'credential-missing' })
  })
})

describe('connectionKeyOf', () => {
  const base = connectionKeyOf(first, endpoint(revision('r1')), alice)

  it('is built from the tenant, the holding, the adoption revision and the account', () => {
    expect(base).toEqual({
      tenant: first,
      holding: 'tenant/files',
      adoptionRevision: 'r1',
      account: alice,
    })
  })

  it('differs for another tenant, another account and another adoption revision', () => {
    expect(connectionKeyOf(second, endpoint(revision('r1')), alice)).not.toEqual(base)
    expect(connectionKeyOf(first, endpoint(revision('r1')), bob)).not.toEqual(base)
    expect(connectionKeyOf(first, endpoint(revision('r2')), alice)).not.toEqual(base)
  })
})

describe('catalogKeyOf', () => {
  const base = catalogKeyOf(first, endpoint(revision('r1')), alice)

  it('is built from the tenant, the account and the holding only', () => {
    expect(base).toEqual({ tenant: first, account: alice, holding: 'tenant/files' })
    expect(catalogKeyOf(first, endpoint(revision('r2')), alice)).toEqual(base)
  })

  it('differs for another tenant and another account', () => {
    expect(catalogKeyOf(second, endpoint(revision('r1')), alice)).not.toEqual(base)
    expect(catalogKeyOf(first, endpoint(revision('r1')), bob)).not.toEqual(base)
  })
})
