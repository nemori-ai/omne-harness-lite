// A contribution that is not in any release: the registry and settle tests mount it instead of a
// domain's. Its handlers answer with what the test hands them.
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'

const empty = ruleCodec({ kind: 'object', fields: {} })
const noteRef = ruleCodec({ kind: 'object', fields: { noteId: { rule: { kind: 'text' } } } })
const note = ruleCodec({
  kind: 'object',
  fields: { noteId: { rule: { kind: 'text' } }, title: { rule: { kind: 'text' } } },
})

export function notesProtocol(major = 1) {
  return defineProtocol({
    name: 'notes',
    major,
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
    },
  })
}
export type NotesProtocol = ReturnType<typeof notesProtocol>

/** A contribution whose handlers answer a fixed title, so two mounts can be told apart. */
export function notesContribution(title: string, major = 1): AccessContribution<NotesProtocol> {
  return {
    protocol: notesProtocol(major),
    operations: {
      'read-note': async (_call, body) => ({
        outcome: 'succeeded',
        body: { noteId: body.noteId, title },
      }),
      'save-note': async () => ({ outcome: 'succeeded', body: {} }),
    },
    observations: {
      'watch-note': async () => ({ outcome: 'basis-unavailable' }),
    },
  }
}

export const NOTES = { name: 'notes', major: 1 } as const

const taggedNote = ruleCodec({
  kind: 'object',
  fields: { noteId: { rule: { kind: 'text' } }, tenant: { rule: { kind: 'text' } } },
})

/**
 * The notes protocol with two more operations for the pipeline (#1233): `ping` needs no login, and
 * `tag-note` carries a tenant in its body that the pipeline hands on unjudged. The operations above
 * are the same, so the registry and settle cases keep using `notesProtocol`. For the observation
 * hub (#1249) it has two more observations: `watch-all` needs no login, and `watch-tenant` acts
 * for a tenant, takes the larger body limit and counts as a business access.
 */
export function pipelineNotesProtocol(major = 1) {
  const base = notesProtocol(major)
  return defineProtocol({
    name: 'notes',
    major,
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
      ping: {
        identity: 'none',
        effect: 'read',
        limit: 'small',
        body: empty,
        outcomes: { succeeded: empty },
        countsAsAccess: true,
      },
      'tag-note': {
        identity: 'acting-tenant',
        effect: 'commit',
        limit: 'small',
        body: taggedNote,
        outcomes: { succeeded: empty },
      },
    },
    observations: {
      ...base.observations,
      'watch-all': { identity: 'none', open: empty, frame: note, ends: [] },
      'watch-tenant': {
        identity: 'acting-tenant',
        limit: 'input',
        open: noteRef,
        frame: note,
        ends: ['note-deleted'],
        countsAsAccess: true,
      },
    },
  })
}
export type PipelineNotesProtocol = ReturnType<typeof pipelineNotesProtocol>
