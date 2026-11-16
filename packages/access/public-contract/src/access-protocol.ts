import { defineProtocol } from './protocol.ts'
import { ruleCodec, type RuleValue } from './rule-codec.ts'

const protocolKey = {
  kind: 'object',
  fields: {
    name: { rule: { kind: 'text' } },
    major: { rule: { kind: 'positive-integer' } },
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
        protocols: { rule: { kind: 'array', item: protocolKey } },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['change'] } },
        revision,
        added: { rule: { kind: 'array', item: protocolKey } },
        removed: { rule: { kind: 'array', item: protocolKey } },
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
