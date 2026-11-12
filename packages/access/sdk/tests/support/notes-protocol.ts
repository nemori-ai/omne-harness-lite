// The client side of the notes protocol that server-entry's test entry mounts. Both ends must name
// the same contract; the SDK may not import server-entry, so it is written out here once more.
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const noteRef = ruleCodec({ kind: 'object', fields: { noteId: { rule: { kind: 'text' } } } })
const note = ruleCodec({
  kind: 'object',
  fields: { noteId: { rule: { kind: 'text' } }, title: { rule: { kind: 'text' } } },
})

export const notesProtocol = defineProtocol({
  name: 'notes',
  major: 1,
  operations: {
    'read-note': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: noteRef,
      outcomes: { succeeded: note, 'not-found': empty },
    },
    'save-note': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'input',
      body: note,
      outcomes: { succeeded: empty, conflict: empty },
      countsAsAccess: true,
    },
  },
  observations: {
    'watch-note': { identity: 'login', open: noteRef, frame: note, ends: ['note-deleted'] },
    'watch-all': { identity: 'none', open: empty, frame: note, ends: [] },
  },
})

/** The login proof and the tenant the test entry knows. */
export const PROOF = 'proof-alice-7f3c'
export const TENANT = 'tenant-acme'
