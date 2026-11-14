// A protocol for the tests: one operation that answers at once, one that waits, one observation.
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })

export const notesProtocol = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    ping: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
    hold: {
      identity: 'none',
      effect: 'commit',
      limit: 'small',
      body: empty,
      outcomes: { succeeded: empty },
    },
  },
  observations: {
    'watch-all': { identity: 'none', open: empty, frame: empty, ends: [] },
  },
})

export const NOTES = { name: 'notes', major: 1 } as const
export const ACCESS = { name: 'access', major: 1 } as const
export const OTHER = { name: 'other', major: 1 } as const
