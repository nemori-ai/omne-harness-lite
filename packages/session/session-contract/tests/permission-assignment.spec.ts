import { describe, expect, it } from 'vitest'
import {
  commandDigest,
  decide,
  reduce,
  type SessionCommand,
  type WorkSnapshot,
  type Decision,
  type CommittedBatch,
} from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { initializationScenario } from './initialization-scenario.ts'
import { readJsonText } from '@omne-harness/json-text'
import type { PermissionDefinition } from '@omne-harness/permissions'

const definition: PermissionDefinition = {
  reference: {
    origin: { kind: 'independent', providerId: 'calendar', definitionRef: 'calendar-v1' },
    itemId: 'create',
    revision: '1',
  },
  capabilityId: 'calendar',
  enforcementKey: 'create',
  title: 'Create',
  description: 'Create a schedule',
  approvalEffect: 'May create a schedule',
  supportedScopes: [{ kind: 'session', description: 'This session' }],
  assignmentLayers: ['session'],
  values: [
    { id: 'allow', title: 'Allow', description: 'May create', permitsOperation: true },
    { id: 'deny', title: 'Deny', description: 'Must not create', permitsOperation: false },
  ],
  comparison: null,
  defaultRule: { pick: 'deny', allowedSet: null },
  settings: null,
}

function assignment(snapshot: WorkSnapshot) {
  return {
    kind: 'change',
    input: {
      tenant: snapshot.tenant,
      session: snapshot.session,
      operation: operationId('assign-permission'),
      declaration: {
        kind: 'permission-assignment',
        capabilityId: 'calendar',
        enforcementKey: 'create',
        definition: {
          origin: { kind: 'independent', providerId: 'calendar', definitionRef: 'calendar-v1' },
          itemId: 'create',
          revision: '1',
        },
        rule: { pick: 'allow', allowedSet: null },
        expectedRevision: snapshot.permissions.revision,
        authorization: evidence('caller-controlled-reference'),
      },
    },
  } satisfies SessionCommand
}

// These are named transaction facts for pure domain tests, not a production login authority.
function qualified(snapshot: WorkSnapshot, command: SessionCommand) {
  return {
    compaction: null,
    permissionChange: {
      operation: command.input.operation,
      commandDigest: commandDigest(command),
      revision: snapshot.permissions.revision,
      definition,
      authority: evidence('qualified-write-fixture'),
    },
  }
}

function committed(snapshot: WorkSnapshot, decision: Decision) {
  expect(decision.kind).toBe('entries')
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const revision = String(BigInt(snapshot.revision) + 1n) as CommittedBatch['revision']
  const batch: CommittedBatch = {
    revision,
    entries: decision.entries.map((entry, index) => ({
      ...entry,
      revision,
      id: `${revision}/${index}` as CommittedBatch['entries'][number]['id'],
    })),
  }
  const result = reduce(snapshot, batch)
  expect(result.kind).toBe('reduced')
  if (result.kind !== 'reduced') throw new Error(result.diagnostic)
  return { snapshot: result.snapshot, batch }
}

describe('Session permission assignments through decide and reduce', () => {
  it('rejects a caller supplied authorization reference without original write qualification', () => {
    const scene = initializationScenario()
    const command = assignment(scene.preview())
    expect(decide(scene.preview(), command, [], null, { compaction: null })).toEqual({
      kind: 'rejected',
      failure: { kind: 'denied', action: 'change' },
    })
  })
  it('commits an exact assignment and replays it without using the current definition', () => {
    const snapshot = initializationScenario().preview()
    const command = assignment(snapshot)
    const saved = committed(
      snapshot,
      decide(snapshot, command, [], null, qualified(snapshot, command)),
    )
    expect(saved.snapshot.permissions).toMatchObject({
      revision: '1',
      assignments: [
        {
          capabilityId: 'calendar',
          enforcementKey: 'create',
          definition: definition.reference,
          rule: { pick: 'allow', allowedSet: null },
        },
      ],
    })
    expect(reduce(snapshot, saved.batch)).toEqual({ kind: 'reduced', snapshot: saved.snapshot })
    expect(reduce(saved.snapshot, saved.batch)).toEqual({
      kind: 'reduced',
      snapshot: saved.snapshot,
    })
  })
  it('invalidates a prepared assignment when the permission mode changes', () => {
    const before = initializationScenario().preview()
    const command = assignment(before)
    const prepared = qualified(before, command)
    const mode = {
      kind: 'change',
      input: {
        tenant: before.tenant,
        session: before.session,
        operation: operationId('mode-change'),
        declaration: {
          kind: 'permission-mode',
          value: 'never',
          authorization: evidence('mode-authority'),
        },
      },
    } satisfies SessionCommand
    const after = committed(before, decide(before, mode, [], null, { compaction: null })).snapshot
    expect(after.permissions.revision).toBe('1')
    expect(decide(after, command, [], null, prepared)).toEqual({
      kind: 'rejected',
      failure: { kind: 'changed', revision: after.revision },
    })
  })

  it.each(['permission-assignment', 'permission-mode'] as const)(
    'quarantines %s disguised as an ordinary declaration event',
    kind => {
      const before = initializationScenario().preview()
      const ordinary = {
        kind: 'change',
        input: {
          tenant: before.tenant,
          session: before.session,
          operation: operationId('ordinary-change'),
          declaration: {
            kind: 'declaration',
            item: 'unrelated',
            value: null,
            basis: evidence('ordinary'),
          },
        },
      } satisfies SessionCommand
      const original = committed(before, decide(before, ordinary, [], null, { compaction: null }))
      const raw =
        kind === 'permission-assignment'
          ? assignment(before).input.declaration
          : { kind, value: 'never', authorization: evidence('mode') }
      const parsed = readJsonText(JSON.stringify({ declaration: raw, scope: null }), {
        maxBytes: 10000,
        maxDepth: 20,
        maxItems: 100,
        maxMembers: 100,
        maxStringLength: 1000,
        maxNumberLength: 100,
      })
      if (parsed.kind !== 'ok') throw new Error('invalid test payload')
      const batch = {
        ...original.batch,
        entries: original.batch.entries.map(entry => ({ ...entry, payload: parsed.value })),
      }
      expect(reduce(before, batch).kind).toBe('quarantined')
    },
  )

  it('replaces one key, preserves other keys, and clears even after its definition is withdrawn', () => {
    const before = initializationScenario().preview()
    const first = assignment(before)
    const one = committed(
      before,
      decide(before, first, [], null, qualified(before, first)),
    ).snapshot
    const deny = {
      ...assignment(one),
      input: {
        ...assignment(one).input,
        operation: operationId('deny'),
        declaration: {
          ...assignment(one).input.declaration,
          rule: { pick: 'deny', allowedSet: ['deny'] },
        },
      },
    } satisfies SessionCommand
    const denied = committed(one, decide(one, deny, [], null, qualified(one, deny))).snapshot
    expect(denied.permissions.assignments).toHaveLength(1)
    expect(denied.permissions.assignments[0]?.rule).toEqual({ pick: 'deny', allowedSet: ['deny'] })
    const other = {
      ...assignment(denied),
      input: {
        ...assignment(denied).input,
        operation: operationId('other'),
        declaration: { ...assignment(denied).input.declaration, enforcementKey: 'read' },
      },
    } satisfies SessionCommand
    const otherFacts = qualified(denied, other)
    otherFacts.permissionChange.definition = { ...definition, enforcementKey: 'read' }
    const both = committed(denied, decide(denied, other, [], null, otherFacts)).snapshot
    const clear = {
      ...assignment(both),
      input: {
        ...assignment(both).input,
        operation: operationId('clear'),
        declaration: { ...assignment(both).input.declaration, rule: null },
      },
    } satisfies SessionCommand
    const facts = qualified(both, clear)
    const cleared = committed(
      both,
      decide(both, clear, [], null, {
        ...facts,
        permissionChange: { ...facts.permissionChange, definition: null },
      }),
    ).snapshot
    expect(cleared.permissions.revision).toBe('4')
    expect(cleared.permissions.assignments.map(item => item.enforcementKey)).toEqual(['read'])
    expect(both.permissions.assignments).toHaveLength(2)
    expect(decide(cleared, clear, [], null, facts)).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'changed',
        revision: cleared.revision,
      },
    })
  })

  it.each(['operation', 'commandDigest', 'revision'] as const)(
    'refuses a write fact with another %s',
    field => {
      const snapshot = initializationScenario().preview()
      const command = assignment(snapshot)
      const facts = qualified(snapshot, command)
      const altered = {
        ...facts,
        permissionChange: { ...facts.permissionChange, [field]: 'wrong' },
      }
      const result = decide(snapshot, command, [], null, altered)
      expect(result.kind).toBe('rejected')
    },
  )

  it.each([
    { pick: 'unknown', allowedSet: null },
    { pick: null, allowedSet: ['allow', 'allow'] },
    { pick: null, allowedSet: ['unknown'] },
  ])('rejects a rule outside the adopted definition: %j', rule => {
    const snapshot = initializationScenario().preview()
    const original = assignment(snapshot)
    const command = {
      ...original,
      input: { ...original.input, declaration: { ...original.input.declaration, rule } },
    } satisfies SessionCommand
    expect(decide(snapshot, command, [], null, qualified(snapshot, command)).kind).toBe('rejected')
  })

  it('does not confuse an unsupported session layer or a replaced definition with no assignment', () => {
    const snapshot = initializationScenario().preview()
    const command = assignment(snapshot)
    const facts = qualified(snapshot, command)
    for (const unsupported of [
      { ...definition, assignmentLayers: [] },
      { ...definition, reference: { ...definition.reference, revision: '2' } },
    ]) {
      expect(
        decide(snapshot, command, [], null, {
          ...facts,
          permissionChange: { ...facts.permissionChange, definition: unsupported },
        }).kind,
      ).toBe('rejected')
    }
  })
  it('cannot clear an existing assignment using another definition reference', () => {
    const before = initializationScenario().preview()
    const first = assignment(before)
    const saved = committed(
      before,
      decide(before, first, [], null, qualified(before, first)),
    ).snapshot
    const original = assignment(saved)
    const replacement = { ...definition, reference: { ...definition.reference, revision: '2' } }
    const clear = {
      ...original,
      input: {
        ...original.input,
        operation: operationId('wrong-clear'),
        declaration: {
          ...original.input.declaration,
          definition: replacement.reference,
          rule: null,
        },
      },
    } satisfies SessionCommand
    const facts = qualified(saved, clear)
    facts.permissionChange.definition = replacement
    expect(decide(saved, clear, [], null, facts).kind).toBe('rejected')
  })

  it('treats a missing legacy projection as unavailable rather than an empty assignment', () => {
    const before = initializationScenario().preview()
    const command = assignment(before)
    const facts = qualified(before, command)
    const legacy = { ...before }
    Reflect.deleteProperty(legacy, 'permissions')
    expect(decide(legacy, command, [], null, facts)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
  })
})
