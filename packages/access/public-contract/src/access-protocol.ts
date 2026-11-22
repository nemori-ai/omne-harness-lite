import { defineProtocol } from './protocol.ts'
import { ruleCodec, type RuleValue } from './rule-codec.ts'

const protocolKey = {
  kind: 'object',
  fields: {
    name: { rule: { kind: 'text' } },
    major: { rule: { kind: 'positive-integer' } },
  },
} as const

/** A protocol that is served, with what its contract is at: both came at revision 2. */
const servedProtocol = {
  kind: 'object',
  fields: {
    name: { rule: { kind: 'text' } },
    major: { rule: { kind: 'positive-integer' } },
    revision: { rule: { kind: 'positive-integer' }, optional: true, since: 2 },
    digest: { rule: { kind: 'text' }, optional: true, since: 2 },
  },
} as const

/** The protocols two instances hold at once: none of them is served. */
const conflicts = {
  rule: { kind: 'array', item: protocolKey },
  optional: true,
  since: 2,
} as const

/** An extension point the server declares; `keys` is there only for a point whose keys are public. */
const point = {
  kind: 'object',
  fields: {
    name: { rule: { kind: 'text' } },
    major: { rule: { kind: 'positive-integer' } },
    revision: { rule: { kind: 'positive-integer' } },
    digest: { rule: { kind: 'text' } },
    keys: { rule: { kind: 'array', item: { kind: 'text' } }, optional: true },
  },
} as const

const revision = { rule: { kind: 'positive-integer' } } as const

const availabilityFrame = {
  kind: 'one-of',
  rules: [
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['snapshot'] } },
        revision,
        protocols: { rule: { kind: 'array', item: servedProtocol } },
        conflicts,
        points: { rule: { kind: 'array', item: point }, optional: true, since: 2 },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['change'] } },
        revision,
        added: { rule: { kind: 'array', item: servedProtocol } },
        removed: { rule: { kind: 'array', item: protocolKey } },
        conflicts,
      },
    },
  ],
} as const

export type AvailabilityFrame = RuleValue<typeof availabilityFrame>

export const accessProtocol = defineProtocol({
  name: 'access',
  major: 1,
  operations: {},
  observations: {
    availability: {
      identity: 'none',
      open: ruleCodec({ kind: 'object', fields: {} }),
      frame: ruleCodec(availabilityFrame),
      ends: [],
    },
  },
})

export type AccessProtocol = typeof accessProtocol
