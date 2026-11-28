import { defineProtocol, LEAF_ALLOWS, ruleCodec } from '@omne-harness/public-contract'
import { contractRules } from '@omne-harness/public-contract/snapshot'
import { describe, expect, it } from 'vitest'
import type { ProtocolRules } from '@omne-harness/plugin-tools'
import { sighted } from './world.ts'

const weather = defineProtocol({
  name: 'weather',
  major: 1,
  operations: {
    look: {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec({
        kind: 'object',
        fields: {
          city: { rule: { kind: 'text' } },
          days: { rule: { kind: 'page-limit' }, optional: true, since: 2 },
          units: { rule: { kind: 'literal', values: ['metric', 'imperial'] } },
          stops: {
            rule: {
              kind: 'array',
              max: 3,
              item: { kind: 'object', fields: { at: { rule: { kind: 'plain-date' } } } },
            },
          },
        },
      }),
      outcomes: {
        succeeded: ruleCodec({ kind: 'object', fields: { sky: { rule: { kind: 'text' } } } }),
      },
    },
  },
  observations: {},
})

const shown = {
  name: 'weather',
  major: 1,
  revision: 2,
  held: 'tenant' as const,
  rules: contractRules(weather) as ProtocolRules,
}

const world = { server: 'unavailable' as const, clients: 'unavailable' as const, scope: [] }

describe('show of a protocol: each operation, field by field, with what each field allows', () => {
  it('reads the protocol the tenant can call as its contract says it', async () => {
    const t = sighted(world, '7c1f', {
      protocol: (name, major) => (name === 'weather' && major === 1 ? shown : 'not-found'),
    })
    const text = await t.text('show', { name: 'weather/v1' })
    expect(text.split('\n').slice(1, -1)).toEqual([
      'weather/v1   revision 2   held by this tenant',
      'operations:',
      '  look   read   identity login',
      '    body:',
      `      city         ${LEAF_ALLOWS.text}`,
      `      days?        ${LEAF_ALLOWS['page-limit']}   from revision 2`,
      '      units        one of "metric", "imperial"',
      '      stops        a list (at most 3, each an object with the fields at)',
      `      stops[].at   ${LEAF_ALLOWS['plain-date']}`,
      '    answers succeeded:',
      `      sky   ${LEAF_ALLOWS.text}`,
      '    answers also, with no body: protocol-rejected, basis-unavailable, denied',
      'A body is checked against these rules before it is sent; a refused one says where, what was given and what is allowed.',
    ])
  })

  it('answers not found for a protocol the tenant cannot call, with the nearest it can', async () => {
    const t = sighted(world, '7c1f', {
      protocol: () => 'not-found',
      protocols: () => ['weather/v1', 'notes/v1'],
    })
    const failure = await t.failure('show', { name: 'wether/v1' })
    expect(failure.reason).toBe(
      'there is no protocol "wether/v1" this tenant can call now. Nearest: weather/v1, notes/v1. show access.protocols lists the protocols there are now.',
    )
  })

  it('says it cannot read the protocols when they cannot be read, and reads nothing', async () => {
    const t = sighted(world, '7c1f', { protocol: () => 'unavailable' })
    const failure = await t.failure('show', { name: 'weather/v1' })
    expect(failure.reason).toContain('the protocols cannot be read now')
  })
})
