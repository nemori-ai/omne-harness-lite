import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  tenant,
} from '@omne-harness/legal-identity'
import {
  encodeAccountIdText,
  encodeGovernanceRequest,
  encodeLoginStateIdText,
  encodeOrganizationIdText,
  encodeTenantText,
  readAccountIdText,
  readGovernanceRequest,
  readLoginStateIdText,
  readOrganizationIdText,
  readTenantText,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'

const org = 'org_00000000000000000000000000'
const acc = 'acc_00000000000000000000000001'
const lgn = 'lgn_00000000000000000000000002'
const tenantJson = JSON.stringify({ organization: org, account: acc })

interface Family {
  readonly name: string
  readonly good: string
  readonly read: (text: string) => unknown
  readonly encode: (value: never) => string
  readonly bad: readonly string[]
}

const families: readonly Family[] = [
  {
    name: 'organization',
    good: org,
    read: readOrganizationIdText,
    encode: encodeOrganizationIdText,
    bad: [
      '',
      acc,
      ` ${org}`,
      `${org} `,
      org.toUpperCase(),
      `${org}0`,
      'org_',
      'org_ilou0000000000000000000000',
    ],
  },
  {
    name: 'account',
    good: acc,
    read: readAccountIdText,
    encode: encodeAccountIdText,
    bad: ['', org, ` ${acc}`, `${acc}\n`, acc.toUpperCase(), acc.slice(0, -1), 'acc_'],
  },
  {
    name: 'login',
    good: lgn,
    read: readLoginStateIdText,
    encode: encodeLoginStateIdText,
    bad: ['', org, ` ${lgn}`, `${lgn}\t`, lgn.toUpperCase(), `${lgn}x`, 'lgn_'],
  },
  {
    name: 'tenant',
    good: tenantJson,
    read: readTenantText,
    encode: encodeTenantText,
    bad: [
      '',
      '{}',
      'null',
      '[]',
      org,
      JSON.stringify({ organization: org }),
      JSON.stringify({ organization: acc, account: org }),
      JSON.stringify({ organization: org, account: acc, extra: 'x' }),
      // Duplicate member: the last value would win in JSON.parse, so a strict read must refuse it.
      `{"organization":"${org}","organization":"${org}","account":"${acc}"}`,
      `{"organization":"${org}","account":"${acc}"} x`,
      `{"organization":"${org}","account":"${acc}\ud800"}`,
    ],
  },
]

describe.each(families)('$name text', ({ good, read, encode, bad }) => {
  it('reads a valid text and writes the same text back', () => {
    const value = read(good)
    expect(value).toBeDefined()
    expect(encode(value as never)).toBe(good)
  })

  it.each(bad)('reads %j as undefined', text => {
    expect(read(text)).toBeUndefined()
  })

  it('reads a non-string as undefined and refuses to write a value it did not mint', () => {
    expect(read(undefined as never)).toBeUndefined()
    expect(read(42 as never)).toBeUndefined()
    expect(() => encode({ name: 'forged', text: good } as never)).toThrow(
      new TypeError('value is not an identity minted by the identity package'),
    )
  })
})

describe('agreement with the identity package and the message codecs', () => {
  it('mints values the message codecs accept, so a request built from them encodes', () => {
    const login = readLoginStateIdText(lgn)
    const tenantValue = readTenantText(tenantJson)
    if (login === undefined || tenantValue === undefined) throw new Error('read failed')
    const encoded = encodeGovernanceRequest({
      request: {
        protocolVersion: 'governance-public/1',
        messageId: 'm',
        operation: 'revoke-login',
        proof: { kind: 'present', value: 'p' },
        body: { targetLoginId: login },
      },
      limits: {
        maxBytes: 4096,
        maxDepth: 8,
        maxItems: 64,
        maxMembers: 8,
        maxStringLength: 256,
        maxNumberLength: 8,
      },
    })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') return
    const read = readGovernanceRequest({
      bytes: encoded.bytes,
      limits: {
        maxBytes: 4096,
        maxDepth: 8,
        maxItems: 64,
        maxMembers: 8,
        maxStringLength: 256,
        maxNumberLength: 8,
      },
    })
    expect(read.kind).toBe('request')
  })

  it('writes values minted by the identity package', () => {
    const o = organizationCodec.parse(org)
    const a = accountCodec.parse(acc)
    const l = loginStateCodec.parse(lgn)
    if (!o.ok || !a.ok || !l.ok) throw new Error('parse failed')
    expect(encodeOrganizationIdText(o.value)).toBe(org)
    expect(encodeAccountIdText(a.value)).toBe(acc)
    expect(encodeLoginStateIdText(l.value)).toBe(lgn)
    expect(JSON.parse(encodeTenantText(tenant(o.value, a.value)))).toEqual({
      organization: org,
      account: acc,
    })
  })
})
