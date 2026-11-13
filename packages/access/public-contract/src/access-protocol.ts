// The built-in protocol `access/v1` (RFC-0015 §5「内置协议与可用性」, #1249 spec 已定 8, 9). Both
// ends use this one value: the entry mounts its implementation at start, the client subscribes to
// its only observation, `availability`, before it signs in. It needs no login: which protocols are
// mounted is not a secret, and signing in is itself an operation of some protocol.
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

/**
 * One frame of the availability: a snapshot of the whole set, or one change of it. A change's base
 * is `revision - 1`: the registry's revision grows by one with each change, one change a frame.
 */
export type AvailabilityFrame = RuleValue<typeof availabilityFrame>

/** `access/v1`: no operation, one observation that needs no login and has no own end reason. */
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
