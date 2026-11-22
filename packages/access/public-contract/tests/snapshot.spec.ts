import { describe, expect, it } from 'vitest'
import {
  defineProtocol,
  ruleCodec,
  type FieldRule,
  type ObservationContract,
  type OperationContract,
  type ProtocolContract,
  type Rule,
} from '@omne-harness/public-contract'
import {
  checkRecorded,
  nextSnapshot,
  snapshotProblems,
  type ContractSnapshot,
} from '@omne-harness/public-contract/snapshot'

const codecOf = ruleCodec as unknown as (rule: Rule) => OperationContract['body']
const text = { kind: 'text' } as const
const state = (...values: string[]): Rule => ({ kind: 'literal', values })

type Shape = Readonly<{
  fields?: Record<string, FieldRule>
  states?: readonly string[]
  outcomes?: readonly string[]
  operations?: Record<string, Partial<OperationContract>>
  ends?: readonly string[]
  identity?: OperationContract['identity']
  watch?: Partial<ObservationContract>
}>

/** `notes/v1` with a few things a later build could change. */
function notes(shape: Shape = {}): ProtocolContract {
  const note = codecOf({
    kind: 'object',
    fields: {
      id: { rule: text },
      state: { rule: state(...(shape.states ?? ['draft', 'shared'])) },
      ...shape.fields,
    },
  })
  const empty = codecOf({ kind: 'object', fields: {} })
  const outcomes = Object.fromEntries((shape.outcomes ?? []).map(outcome => [outcome, empty]))
  const read = {
    identity: shape.identity ?? 'login',
    effect: 'read',
    limit: 'small',
    body: empty,
    outcomes: { succeeded: note, ...outcomes },
  }
  const more = Object.fromEntries(
    Object.entries(shape.operations ?? {}).map(([name, extra]) => [name, { ...read, ...extra }]),
  )
  const observations = {
    watch: {
      identity: 'login',
      open: empty,
      frame: note,
      ends: shape.ends ?? ['gone'],
      ...shape.watch,
    },
  }
  const protocol = { name: 'notes', major: 1, operations: { read, ...more }, observations }
  return defineProtocol(protocol as never) as unknown as ProtocolContract
}

async function recorded(protocol: ProtocolContract): Promise<ContractSnapshot> {
  const next = await nextSnapshot(protocol, undefined)
  if (!next.ok) throw new Error(next.problems.join('; '))
  return next.snapshot
}

const later = (since: number): FieldRule => ({ rule: text, optional: true, since })

describe('the first snapshot', () => {
  it('records the rules as data and one digest for every revision up to the current one', async () => {
    const snapshot = await recorded(notes({ fields: { colour: later(2), tag: later(3) } }))
    expect(snapshot).toMatchObject({ name: 'notes', major: 1, revision: 3 })
    expect(Object.keys(snapshot.digests)).toEqual(['1', '2', '3'])
    expect(new Set(Object.values(snapshot.digests)).size).toBe(3)
    for (const digest of Object.values(snapshot.digests))
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(snapshot.rules).toMatchObject({
      operations: {
        read: {
          identity: 'login',
          effect: 'read',
          limit: 'small',
          body: { kind: 'object', fields: {} },
          outcomes: {
            succeeded: { kind: 'object', fields: { colour: { optional: true, since: 2 } } },
            'protocol-rejected': true,
          },
        },
      },
      observations: { watch: { identity: 'login', ends: ['gone'] } },
    })
  })

  it('writes a flag only where it is set, and the since of an operation and an observation', async () => {
    const bare = await recorded(notes({ operations: { pin: {} } }))
    const plain = bare.rules as {
      operations: Record<string, object>
      observations: Record<string, object>
    }
    for (const key of ['carriesCredential', 'countsAsAccess', 'since'])
      expect(plain.operations['pin']).not.toHaveProperty(key)
    for (const key of ['limit', 'countsAsAccess', 'since'])
      expect(plain.observations['watch']).not.toHaveProperty(key)
    const set = await recorded(
      notes({
        operations: { pin: { carriesCredential: true, countsAsAccess: true, since: 2 } },
        watch: { limit: 'small', countsAsAccess: true, since: 3 },
      }),
    )
    expect(set.rules).toMatchObject({
      operations: { pin: { carriesCredential: true, countsAsAccess: true, since: 2 } },
      observations: { watch: { limit: 'small', countsAsAccess: true, since: 3 } },
    })
    expect(set.revision).toBe(3)
  })

  it('is the same whatever order the rules were written in', async () => {
    const one = await recorded(notes({ fields: { a: later(2), b: later(2) } }))
    const other = await recorded(notes({ fields: { b: later(2), a: later(2) } }))
    expect(JSON.stringify(other)).toBe(JSON.stringify(one))
  })

  it('has nothing to say about the protocol it was taken from', async () => {
    const protocol = notes({ fields: { colour: later(2) } })
    expect(await snapshotProblems(protocol, await recorded(protocol))).toEqual([])
  })
})

describe('a change that adds: a new revision (V4)', () => {
  it('an optional field with the next since: the recorded revisions still hold, the new one is not recorded yet', async () => {
    const before = await recorded(notes())
    const after = notes({ fields: { colour: later(2) } })
    expect(await snapshotProblems(after, before)).toEqual([
      'notes/v1: revision 2 is not recorded; record it with OMNE_CONTRACT_SNAPSHOT=append',
    ])
    const next = await nextSnapshot(after, before)
    if (!next.ok) throw new Error(next.problems.join('; '))
    expect(next.snapshot.digests['1']).toBe(before.digests['1'])
    expect(Object.keys(next.snapshot.digests)).toEqual(['1', '2'])
    expect(await snapshotProblems(after, next.snapshot)).toEqual([])
  })

  it('an operation with the next since', async () => {
    const before = await recorded(notes())
    const after = notes({ operations: { pin: { effect: 'commit', since: 2 } } })
    const next = await nextSnapshot(after, before)
    expect(next.ok).toBe(true)
    if (next.ok) expect(next.snapshot.digests['1']).toBe(before.digests['1'])
  })

  it('appending again changes nothing', async () => {
    const protocol = notes({ fields: { colour: later(2) } })
    const once = await recorded(protocol)
    const twice = await nextSnapshot(protocol, once)
    expect(twice).toEqual({ ok: true, snapshot: once })
  })
})

describe('a change that breaks: a published revision no longer reads as recorded (V4)', () => {
  const changed = (revision: number): string =>
    `notes/v1: revision ${revision} changed after it was recorded; add with a new since, or change the major`
  const tag = { tag: later(2) }
  const cases: readonly (readonly [string, Shape, Shape, readonly number[]])[] = [
    ['a field taken away', { fields: { ...tag, colour: later(2) } }, { fields: tag }, [2]],
    [
      'a field of another kind',
      { fields: { n: { rule: text } } },
      { fields: { n: { rule: { kind: 'boolean' } } } },
      [1],
    ],
    ['one more value in a set of values', {}, { states: ['draft', 'shared', 'gone'] }, [1]],
    [
      'a field added without a new since',
      {},
      { fields: { colour: { rule: text, optional: true } } },
      [1],
    ],
    [
      'a field made to have come earlier',
      { fields: { ...tag, colour: later(2) } },
      { fields: { ...tag, colour: { rule: text, optional: true } } },
      [1],
    ],
    [
      'an optional field made required',
      { fields: { c: { rule: text, optional: true } } },
      { fields: { c: { rule: text } } },
      [1],
    ],
    ['one more outcome', {}, { outcomes: ['conflict'] }, [1]],
    ['one more end of an observation', {}, { ends: ['gone', 'moved'] }, [1]],
    ['an operation added without a new since', {}, { operations: { pin: {} } }, [1]],
    [
      'an operation taken away',
      { fields: tag, operations: { pin: { since: 2 } } },
      { fields: tag },
      [2],
    ],
    ['another identity', {}, { identity: 'acting-tenant' }, [1]],
    [
      'an operation that starts to carry a credential',
      { operations: { pin: {} } },
      { operations: { pin: { carriesCredential: true } } },
      [1],
    ],
    [
      'an operation that stops counting as access',
      { operations: { pin: { countsAsAccess: true } } },
      { operations: { pin: {} } },
      [1],
    ],
    ['an observation given a limit', {}, { watch: { limit: 'small' } }, [1]],
    [
      'an observation with another limit',
      { watch: { limit: 'small' } },
      { watch: { limit: 'input' } },
      [1],
    ],
    ['an observation that starts to count as access', {}, { watch: { countsAsAccess: true } }, [1]],
    [
      'an operation made to have come earlier',
      { fields: tag, operations: { pin: { since: 2 } } },
      { fields: tag, operations: { pin: {} } },
      [1],
    ],
  ]

  it.each(cases)('%s', async (_name, before, after, revisions) => {
    const snapshot = await recorded(notes(before))
    const now = notes(after)
    expect(await snapshotProblems(now, snapshot)).toEqual(revisions.map(changed))
    expect(await nextSnapshot(now, snapshot)).toEqual({
      ok: false,
      problems: revisions.map(changed),
    })
  })

  it('a revision that was published and is gone: the revision cannot go down', async () => {
    const snapshot = await recorded(notes({ fields: { colour: later(2) } }))
    expect(await snapshotProblems(notes(), snapshot)).toContain(
      'notes/v1: revision 2 was recorded and the contract is now at 1; a revision cannot go down',
    )
  })

  const gone = (revision: number): string =>
    `notes/v1: revision ${revision} is recorded and its digest is gone; a recorded revision is never taken out`

  it('a digest taken out so that its revision could change: neither the check nor the append takes it', async () => {
    const snapshot = await recorded(notes({ fields: { colour: later(2) } }))
    const after = notes({ states: ['draft', 'shared', 'gone'], fields: { colour: later(2) } })
    const cut = {
      ...snapshot,
      digests: { '2': snapshot.digests['2'] },
      rules: (await recorded(after)).rules,
    }
    expect(await snapshotProblems(after, cut)).toEqual([gone(1), changed(2)])
    expect(await nextSnapshot(after, cut)).toEqual({ ok: false, problems: [gone(1), changed(2)] })
  })

  it('the last digest taken out: the record still says how far it went', async () => {
    const snapshot = await recorded(notes({ fields: { colour: later(2) } }))
    const after = notes({ fields: { colour: later(2), tag: later(2) } })
    const cut = { ...snapshot, digests: { '1': snapshot.digests['1'] } }
    expect(await snapshotProblems(after, cut)).toEqual([gone(2)])
    expect(await nextSnapshot(after, cut)).toEqual({ ok: false, problems: [gone(2)] })
  })
})

describe('what is not a snapshot of this protocol', () => {
  const notSnapshots: readonly (readonly [string, unknown])[] = [
    ['not an object', 'x'],
    [
      'another name',
      { name: 'other', major: 1, revision: 1, rules: {}, digests: { '1': 'sha256:0' } },
    ],
    ['no digests', { name: 'notes', major: 1, revision: 1, rules: {} }],
    ['no revision', { name: 'notes', major: 1, rules: {}, digests: { '1': 'sha256:0' } }],
    ['another major', { name: 'notes', major: 2, revision: 1, rules: {}, digests: { '1': 'x' } }],
    ['digests that are null', { name: 'notes', major: 1, revision: 1, rules: {}, digests: null }],
    [
      'a digest that is not text',
      { name: 'notes', major: 1, revision: 1, rules: {}, digests: { '1': 5 } },
    ],
    ...['0', '01', '1x', 'x1', 'one'].map(
      key =>
        [
          `a digest under the key ${key}`,
          { name: 'notes', major: 1, revision: 1, rules: {}, digests: { '1': 'x', [key]: 'x' } },
        ] as const,
    ),
    [
      'a revision that is not one',
      { name: 'notes', major: 1, revision: 0, rules: {}, digests: {} },
    ],
  ]

  it.each(notSnapshots)('%s', async (_name, value) => {
    expect(await snapshotProblems(notes(), value)).toEqual([
      'notes/v1: the file is not a snapshot of this protocol',
    ])
  })

  it('a snapshot whose rules are not the current ones, though every digest holds', async () => {
    const protocol = notes()
    const snapshot = await recorded(protocol)
    expect(await snapshotProblems(protocol, { ...snapshot, rules: {} })).toEqual([
      'notes/v1: the recorded rules are not the current ones; record them with OMNE_CONTRACT_SNAPSHOT=append',
    ])
  })

  it('a codec that was not built from a rule cannot be recorded', async () => {
    const protocol = notes()
    const read = protocol.operations['read'] as OperationContract
    const handmade = { read: () => ({ ok: false }), write: () => ({ ok: false }) } as never
    const bare = { ...protocol, operations: { read: { ...read, body: handmade } } }
    expect(await snapshotProblems(bare, await recorded(protocol))).toEqual([
      'notes/v1: the body of read was not built by ruleCodec, so its rules cannot be recorded',
    ])
  })

  it('names the part that was written by hand, and neither checks nor records the protocol', async () => {
    const protocol = notes()
    const read = protocol.operations['read'] as OperationContract
    const watch = protocol.observations['watch'] as ObservationContract
    const handmade = { read: () => ({ ok: false }), write: () => ({ ok: false }) } as never
    const cases: readonly (readonly [string, ProtocolContract])[] = [
      [
        'the outcome succeeded of read',
        {
          ...protocol,
          operations: { read: { ...read, outcomes: { ...read.outcomes, succeeded: handmade } } },
        } as ProtocolContract,
      ],
      [
        'the opening of watch',
        { ...protocol, observations: { watch: { ...watch, open: handmade } } },
      ],
      [
        'the frame of watch',
        { ...protocol, observations: { watch: { ...watch, frame: handmade } } },
      ],
    ]
    for (const [part, bare] of cases) {
      const problem = `notes/v1: ${part} was not built by ruleCodec, so its rules cannot be recorded`
      expect(await snapshotProblems(bare, await recorded(protocol))).toEqual([problem])
      expect(await nextSnapshot(bare, undefined)).toEqual({ ok: false, problems: [problem] })
    }
  })

  it('does not record over a file that is not a snapshot of this protocol', async () => {
    expect(await nextSnapshot(notes(), 'x')).toEqual({
      ok: false,
      problems: ['notes/v1: the file is not a snapshot of this protocol'],
    })
    expect(
      await nextSnapshot(notes(), { name: 'other', major: 1, revision: 1, digests: {} }),
    ).toEqual({ ok: false, problems: ['notes/v1: the file is not a snapshot of this protocol'] })
  })
})

describe('checkRecorded: the file of one protocol', () => {
  function store(initial?: string, append = false) {
    const held = { text: initial, writes: 0 }
    return {
      held,
      store: {
        read: () => held.text,
        write: (next: string) => {
          held.text = next
          held.writes += 1
        },
        append,
      },
    }
  }

  it('says the file is missing, and writes nothing unless asked to append', async () => {
    const { held, store: files } = store()
    expect(await checkRecorded(notes(), files)).toEqual([
      'notes/v1: there is no snapshot; record it with OMNE_CONTRACT_SNAPSHOT=append',
    ])
    expect(held.writes).toBe(0)
  })

  it('writes the first snapshot when asked to append, as JSON that ends with a newline', async () => {
    const { held, store: files } = store(undefined, true)
    expect(await checkRecorded(notes(), files)).toEqual([])
    expect(held.writes).toBe(1)
    expect(held.text?.endsWith('}\n')).toBe(true)
    expect(JSON.parse(held.text ?? '')).toMatchObject({ name: 'notes', major: 1, revision: 1 })
  })

  it('appends a new revision and leaves the file alone when nothing changed', async () => {
    const first = store(undefined, true)
    await checkRecorded(notes(), first.store)
    const second = store(first.held.text, true)
    expect(await checkRecorded(notes(), second.store)).toEqual([])
    expect(second.held.writes).toBe(0)
    expect(await checkRecorded(notes({ fields: { colour: later(2) } }), second.store)).toEqual([])
    expect(second.held.writes).toBe(1)
    expect(Object.keys(JSON.parse(second.held.text ?? '').digests)).toEqual(['1', '2'])
  })

  it('never rewrites a published revision, even when asked to append', async () => {
    const first = store(undefined, true)
    await checkRecorded(notes({ fields: { colour: later(2) } }), first.store)
    const second = store(first.held.text, true)
    expect(await checkRecorded(notes(), second.store)).not.toEqual([])
    expect(second.held.writes).toBe(0)
  })

  it('says a file that is not JSON is not a snapshot', async () => {
    expect(await checkRecorded(notes(), store('{').store)).toEqual([
      'notes/v1: the file is not a snapshot of this protocol',
    ])
  })
})
