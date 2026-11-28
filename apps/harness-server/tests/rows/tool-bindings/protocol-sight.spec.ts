import { scopeOfLayer } from '@omne-harness/assets'
import {
  declare,
  empty,
  install,
  type Contract,
  type Entry,
  type Registry,
} from '@omne-harness/dynamis'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { defineProtocol, ruleCodec, type ProtocolContract } from '@omne-harness/public-contract'
import { contractRules } from '@omne-harness/public-contract/snapshot'
import { describe, expect, it } from 'vitest'
import { protocolKeys, protocolOf } from '../../../src/rows/tool-bindings/protocol-sight.ts'

const PROTOCOLS: Contract = {
  name: 'access.protocols',
  title: '对客户端开放的协议',
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the protocol, <name>/v<major>',
  gives: 'the call context and the body its contract reads',
  item: { kind: 'effect', fields: { contribution: 'object', revision: 'number' } },
  resolve: 'conflict',
  binding: 'run',
  onError: 'the call is answered as the failure its contract names',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'The protocols the entry serves.',
}

const protocol = (name: string) =>
  defineProtocol({
    name,
    major: 1,
    operations: {
      look: {
        identity: 'login',
        effect: 'read',
        limit: 'small',
        body: ruleCodec({ kind: 'object', fields: { city: { rule: { kind: 'text' } } } }),
        outcomes: { succeeded: ruleCodec({ kind: 'text' }) },
      },
    },
    observations: {},
  })

const ALICE = scopeOfLayer('tenant', 'alice')
const BOB = scopeOfLayer('tenant', 'bob')

const served = (name: string, scope: readonly string[]): Entry => ({
  point: 'access.protocols',
  key: `${name}/v1`,
  id: '',
  scope,
  rank: 0,
  digest: `${name}/${scope.join('/')}`,
  item: {
    contribution: { protocol: protocol(name), operations: {}, observations: {} },
    revision: 1,
  } satisfies Readonly<{ contribution: AccessContribution<ProtocolContract>; revision: number }>,
})

function registry(): Registry {
  const made = install(empty, { fiber: 'entry', generation: 1 }, [
    declare(PROTOCOLS),
    served('weather', []),
    served('notes', ALICE),
  ])
  if (made.kind !== 'installed') throw new Error(JSON.stringify(made))
  return made.registry
}

describe('the protocols a tenant can call, as OmneExtensionPoints show reads them', () => {
  it('reads an official one and one its own tenant holds, with the rules of its contract', () => {
    expect(protocolOf(registry(), 'weather', 1, ALICE)).toEqual({
      name: 'weather',
      major: 1,
      revision: 1,
      held: 'deployment',
      rules: contractRules(protocol('weather')),
    })
    expect(protocolOf(registry(), 'notes', 1, ALICE)).toMatchObject({ held: 'tenant' })
    expect(protocolKeys(registry(), ALICE)).toEqual(['notes/v1', 'weather/v1'])
  })

  it('does not find the protocol of another tenant, nor one of another major version', () => {
    expect(protocolOf(registry(), 'notes', 1, BOB)).toBe('not-found')
    expect(protocolOf(registry(), 'weather', 2, BOB)).toBe('not-found')
    expect(protocolKeys(registry(), BOB)).toEqual(['weather/v1'])
  })

  it('says unavailable when the tree is not there', () => {
    expect(protocolOf(undefined, 'weather', 1, ALICE)).toBe('unavailable')
    expect(protocolKeys(undefined, ALICE)).toBe('unavailable')
  })
})
