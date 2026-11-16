import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const noteRef = ruleCodec({ kind: 'object', fields: { noteId: { rule: { kind: 'text' } } } })
const note = ruleCodec({
  kind: 'object',
  fields: {
    noteId: { rule: { kind: 'text' } },
    title: { rule: { kind: 'text' } },
    tags: { rule: { kind: 'array', item: { kind: 'literal', values: ['draft', 'shared'] } } },
    revision: { rule: { kind: 'revision' } },
  },
})
const saved = ruleCodec({ kind: 'object', fields: { revision: { rule: { kind: 'revision' } } } })

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
      outcomes: { succeeded: saved, conflict: empty },
      countsAsAccess: true,
    },
  },
  observations: {
    'watch-note': {
      identity: 'login',
      open: noteRef,
      frame: note,
      ends: ['note-deleted'],
    },
  },
})

export const exampleLimits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
} as const
