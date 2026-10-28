// The memory Journal against the same-shape list of docs/architecture/mechanisms.md
// "两种实现必须同形的事实". Each `describe` names one fact by its number, so the suite can move to a
// durable provider unchanged. Tests read only what the port returns. The three choices that wait
// for #558 have their own `describe` at the end, named 「临时做法，待 #558 裁定」.
import { describe, expect, it, vi } from 'vitest'
import { createMemoryAgentJournal, createTestAgentDependencies } from '@omne-harness/agent/testing'
import { decodeActionId, type AgentEvent, type EventPage } from '@omne-harness/agent-contract'
import * as toolReferences from '@omne-harness/tool-contract'
import {
  access,
  acceptedInput,
  afterTerminalPassage,
  checkpoint,
  commitAt,
  consumption,
  evidence,
  execution,
  failure,
  finish,
  finishInput,
  takeInputs,
  instance,
  load,
  modelCall,
  ok,
  open,
  operation,
  otherTenant,
  producedResult,
  replyAdmission,
  type Journal,
  type Opened,
} from './journal-support.ts'

function memory(options: Parameters<typeof createMemoryAgentJournal<string>>[0] = {}) {
  return createMemoryAgentJournal<string>(options)
}

async function takeover(journal: Journal, opened: Opened, name = 'takeover') {
  return journal.attach({
    ...access,
    execution: opened.execution,
    operation: operation(name),
    instance: instance('instance-2'),
    grant: null,
    recovery: evidence('recovery'),
    takeover: evidence('takeover'),
  })
}

describe('fact 1: conditional commit', () => {
  it('fact 1: a stale expected revision returns changed and saves no part of the commit', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const before = await load(journal, opened.execution)
    const first = commitAt(before, opened.authority, 'step-1')
    ok(await journal.commit(first))
    const middle = await load(journal, opened.execution)

    const stale = commitAt(before, opened.authority, 'step-2', {
      events: [{ kind: 'waiting', waits: [] }],
      state: { kind: 'waiting', waits: [] },
    })
    expect(failure(await journal.commit(stale))).toEqual({ kind: 'changed' })
    expect(await load(journal, opened.execution)).toEqual(middle)
    expect(
      ok(
        await journal.query({ ...access, execution: opened.execution, operation: stale.operation }),
      ),
    ).toEqual({
      kind: 'unknown',
    })
  })

  it('fact 1: a successful commit makes checkpoint, state, effect intents, events and the operation result hold together', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const snapshot = await load(journal, opened.execution)
    const commit = commitAt(snapshot, opened.authority, 'step-1', {
      state: { kind: 'waiting', waits: [] },
      events: [{ kind: 'waiting', waits: [] }],
    })
    const receipt = ok(await journal.commit(commit))
    const after = await load(journal, opened.execution)

    expect(after.revision).toBe(receipt.revision)
    expect(after.checkpoint).toEqual(commit.checkpoint)
    expect(after.state).toEqual({ kind: 'waiting', waits: [] })
    expect(after.output.emittedThrough).toBe('1')
    expect(
      ok(
        await journal.query({
          ...access,
          execution: opened.execution,
          operation: commit.operation,
        }),
      ),
    ).toEqual({
      kind: 'committed',
      receipt,
    })
  })
})

describe('fact 2: idempotence by original operation', () => {
  it('fact 2: commit with the same operation and input returns the original receipt, and with another input conflict', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const commit = commitAt(await load(journal, opened.execution), opened.authority, 'step-1', {
      events: [{ kind: 'waiting', waits: [] }],
    })
    const receipt = ok(await journal.commit(commit))
    const after = await load(journal, opened.execution)

    expect(ok(await journal.commit(commit))).toEqual(receipt)
    expect(await load(journal, opened.execution)).toEqual(after)
    expect(failure(await journal.commit({ ...commit, checkpoint: checkpoint('other') }))).toEqual({
      kind: 'conflict',
      operation: commit.operation,
    })
  })

  it('fact 2: open, submit, control and acknowledge recognize the same input and refuse another one', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    expect((await open(journal)).receipt).toEqual(opened.receipt)
    expect(
      failure(
        await journal.open({
          ...access,
          execution: opened.execution,
          operation: operation('open-exec-1'),
          instance: instance(),
          grant: null,
          initial: acceptedInput('input-other'),
          checkpoint: checkpoint(),
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: operation('open-exec-1') })

    const submit = {
      ...access,
      execution: opened.execution,
      operation: operation('submit-1'),
      value: acceptedInput('input-2'),
    }
    const submitted = ok(await journal.submit(submit))
    expect(ok(await journal.submit(submit))).toEqual(submitted)
    expect(failure(await journal.submit({ ...submit, value: acceptedInput('input-3') }))).toEqual({
      kind: 'conflict',
      operation: submit.operation,
    })

    const control = {
      ...access,
      execution: opened.execution,
      operation: operation('control-1'),
      command: { kind: 'suspend', reason: evidence('reason') },
    } as const
    const controlled = ok(await journal.control(control))
    expect(ok(await journal.control(control))).toEqual(controlled)
    expect(
      failure(
        await journal.control({
          ...control,
          command: { kind: 'cancel', reason: evidence('reason') },
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: control.operation })

    const acknowledge = {
      ...access,
      execution: opened.execution,
      operation: operation('ack-1'),
      through: '1',
      receipt: null,
    }
    const acknowledged = ok(await journal.acknowledge(acknowledge))
    expect(ok(await journal.acknowledge(acknowledge))).toEqual(acknowledged)
    expect(
      failure(await journal.acknowledge({ ...acknowledge, receipt: evidence('mine') })),
    ).toEqual({
      kind: 'conflict',
      operation: acknowledge.operation,
    })
  })

  it('fact 2: recordResult and recordControl recognize the same input and refuse another one', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const record = {
      ...access,
      execution: opened.execution,
      operation: operation('result-1'),
      result: producedResult('c1'),
      consumption: consumption('consumption-1'),
      transfer: { kind: 'none' },
      release: { kind: 'pending' },
    } as const
    const recorded = ok(await journal.recordResult(record))
    expect(ok(await journal.recordResult(record))).toEqual(recorded)
    expect(
      failure(await journal.recordResult({ ...record, consumption: consumption('consumption-2') })),
    ).toEqual({
      kind: 'conflict',
      operation: record.operation,
    })

    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel-1'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    const stage = {
      ...access,
      execution: opened.execution,
      operation: operation('stage-1'),
      target: operation('cancel-1'),
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    } as const
    const staged = ok(await journal.recordControl(stage))
    expect(ok(await journal.recordControl(stage))).toEqual(staged)
    expect(failure(await journal.recordControl({ ...stage, state: 'unresolved' }))).toEqual({
      kind: 'conflict',
      operation: stage.operation,
    })
  })

  it('fact 2: tryFinish, attach, detach and recordTerminalObservation refuse the same operation with another input', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const attach = {
      ...access,
      execution: opened.execution,
      operation: operation('takeover'),
      instance: instance('instance-2'),
      grant: null,
      recovery: evidence('recovery'),
      takeover: evidence('takeover'),
    }
    const taken = ok(await journal.attach(attach))
    expect(failure(await journal.attach({ ...attach, recovery: evidence('other') }))).toEqual({
      kind: 'conflict',
      operation: attach.operation,
    })
    const current: Opened = {
      execution: opened.execution,
      receipt: taken.receipt,
      authority: taken.authority,
    }

    const detach = {
      ...access,
      execution: opened.execution,
      operation: operation('detach'),
      authority: taken.authority,
      reason: evidence('pause'),
    }
    ok(await journal.detach(detach))
    expect(failure(await journal.detach({ ...detach, reason: evidence('other') }))).toEqual({
      kind: 'conflict',
      operation: detach.operation,
    })
    const resumed = ok(
      await journal.attach({ ...attach, operation: operation('resume'), takeover: null }),
    )
    const live: Opened = { ...current, authority: resumed.authority }
    const passage = afterTerminalPassage('observer')
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), live.authority, 'with-passage', {
          checkpoint: checkpoint('F2', [passage]),
        }),
      ),
    )
    ok(await takeInputs(journal, live))
    const finishing = await finishInput(journal, live)
    ok(await journal.tryFinish(finishing))
    expect(
      failure(
        await journal.tryFinish({
          ...finishing,
          intent: { ...finishing.intent, obligations: evidence('other') },
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: finishing.operation })

    const [item] = (await load(journal, opened.execution)).terminalObservations
    if (item === undefined) throw new Error('expected one observation item')
    const observe = {
      ...access,
      execution: opened.execution,
      operation: operation('observe'),
      terminal: item.terminal,
      passage: item.passage,
      implementation: item.implementation,
      observed: evidence('seen'),
    }
    ok(await journal.recordTerminalObservation(observe))
    expect(
      failure(await journal.recordTerminalObservation({ ...observe, observed: evidence('other') })),
    ).toEqual({ kind: 'conflict', operation: observe.operation })
  })

  it('fact 2: a stage fact recorded again under a new operation is recognized, not recorded twice', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    const stage = {
      ...access,
      execution: opened.execution,
      operation: operation('stage-old-attachment'),
      target: operation('cancel'),
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    } as const
    const first = ok(await journal.recordControl(stage))
    const before = await load(journal, opened.execution)
    expect(
      ok(await journal.recordControl({ ...stage, operation: operation('stage-new-attachment') })),
    ).toEqual(first)
    expect(await load(journal, opened.execution)).toEqual(before)
    expect(
      failure(
        await journal.recordControl({
          ...stage,
          operation: operation('stage-other-source'),
          source: evidence('other'),
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: operation('stage-other-source') })
  })
})

describe('fact 3: unknown result', () => {
  it('fact 3: after commit-unknown the original operation queries to one conclusion: committed when the write took effect', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const commit = commitAt(await load(journal.port, opened.execution), opened.authority, 'step-1')
    journal.failNext('commit', { kind: 'commit-unknown', outcome: 'applied' })

    expect(failure(await journal.port.commit(commit))).toEqual({
      kind: 'commit-unknown',
      operation: commit.operation,
    })
    const query = { ...access, execution: opened.execution, operation: commit.operation }
    const answer = ok(await journal.port.query(query))
    expect(answer.kind).toBe('committed')
    expect(ok(await journal.port.query(query))).toEqual(answer)
    // The retry under the original operation recognizes the original receipt.
    expect({ kind: 'committed', receipt: ok(await journal.port.commit(commit)) }).toEqual(answer)
  })

  it('fact 3: after commit-unknown the original operation queries to excluded when the write did not take effect', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const before = await load(journal.port, opened.execution)
    const commit = commitAt(before, opened.authority, 'step-1')
    journal.failNext('commit', { kind: 'commit-unknown', outcome: 'dropped' })

    expect(failure(await journal.port.commit(commit))).toEqual({
      kind: 'commit-unknown',
      operation: commit.operation,
    })
    expect(
      ok(
        await journal.port.query({
          ...access,
          execution: opened.execution,
          operation: commit.operation,
        }),
      ).kind,
    ).toBe('excluded')
    expect(await load(journal.port, opened.execution)).toEqual(before)
  })

  it('fact 3: a participant that cannot tell leaves the commit pending until it is settled', async () => {
    const journal = memory({ participants: ['message'] })
    const opened = await open(journal.port)
    const caller = {
      kind: 'message',
      message: acceptedInput('m').content,
      source: evidence('source'),
      admission: evidence('admission'),
    } as const
    const commit = commitAt(await load(journal.port, opened.execution), opened.authority, 'joint', {
      caller,
    })
    journal.respond('message', 'fail-unknown')
    expect(failure(await journal.port.commit(commit))).toEqual({
      kind: 'commit-unknown',
      operation: commit.operation,
    })
    const query = { ...access, execution: opened.execution, operation: commit.operation }
    expect(ok(await journal.port.query(query))).toEqual({ kind: 'unknown' })
    expect((await load(journal.port, opened.execution)).unresolved).toEqual([commit.operation])

    expect(journal.settle(opened.execution, commit.operation, 'applied')).toBe(true)
    expect(ok(await journal.port.query(query)).kind).toBe('committed')
    expect(journal.joint()).toEqual([
      { execution: opened.execution, operation: commit.operation, caller },
    ])
  })

  it('fact 3: an unknown write whose answer saved nothing queries to excluded', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    ok(
      await journal.port.recordResult({
        ...access,
        execution: opened.execution,
        operation: operation('result'),
        result: producedResult('c1'),
        consumption: consumption('k1'),
        transfer: { kind: 'none' },
        release: { kind: 'pending' },
      }),
    )
    ok(await takeInputs(journal.port, opened))
    const pending = await finishInput(journal.port, opened, 'finish-pending')
    journal.failNext('tryFinish', { kind: 'commit-unknown', outcome: 'pending' })
    failure(await journal.port.tryFinish(pending))
    expect(journal.settle(opened.execution, pending.operation, 'applied')).toBe(true)
    expect(
      ok(
        await journal.port.query({
          ...access,
          execution: opened.execution,
          operation: pending.operation,
        }),
      ).kind,
    ).toBe('excluded')

    const applied = await finishInput(journal.port, opened, 'finish-applied')
    journal.failNext('tryFinish', { kind: 'commit-unknown', outcome: 'applied' })
    failure(await journal.port.tryFinish(applied))
    expect(
      ok(
        await journal.port.query({
          ...access,
          execution: opened.execution,
          operation: applied.operation,
        }),
      ).kind,
    ).toBe('excluded')
    expect((await load(journal.port, opened.execution)).unresolved).toEqual([])
  })
})

describe('fact 4: three conclusions of query', () => {
  it('fact 4: committed carries the original receipt, unknown draws no conclusion, excluded carries evidence', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const query = (name: string) =>
      journal.port.query({ ...access, execution: opened.execution, operation: operation(name) })

    expect(ok(await query('open-exec-1'))).toEqual({ kind: 'committed', receipt: opened.receipt })

    journal.failNext('submit', { kind: 'commit-unknown', outcome: 'pending' })
    failure(
      await journal.port.submit({
        ...access,
        execution: opened.execution,
        operation: operation('pending'),
        value: acceptedInput('input-2'),
      }),
    )
    expect(ok(await query('pending'))).toEqual({ kind: 'unknown' })

    journal.failNext('submit', { kind: 'commit-unknown', outcome: 'dropped' })
    failure(
      await journal.port.submit({
        ...access,
        execution: opened.execution,
        operation: operation('dropped'),
        value: acceptedInput('input-3'),
      }),
    )
    const excluded = ok(await query('dropped'))
    expect(excluded.kind).toBe('excluded')
    expect(excluded).toHaveProperty('evidence.owner')
  })

  it('fact 4: an operation that the Journal never saw is unknown, not excluded', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    expect(
      ok(
        await journal.query({
          ...access,
          execution: opened.execution,
          operation: operation('never'),
        }),
      ),
    ).toEqual({
      kind: 'unknown',
    })
  })

  it('fact 4: excluded also excludes a late commit of the original write', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const commit = commitAt(await load(journal.port, opened.execution), opened.authority, 'step-1')
    journal.failNext('commit', { kind: 'commit-unknown', outcome: 'pending' })
    failure(await journal.port.commit(commit))

    expect(journal.settle(opened.execution, commit.operation, 'dropped')).toBe(true)
    // Nothing is pending any more, so the original write can no longer land.
    expect(journal.settle(opened.execution, commit.operation, 'applied')).toBe(false)
    expect(
      ok(
        await journal.port.query({
          ...access,
          execution: opened.execution,
          operation: commit.operation,
        }),
      ).kind,
    ).toBe('excluded')
    expect((await load(journal.port, opened.execution)).revision).toBe(opened.receipt.revision)
  })
})

describe('fact 5: fence', () => {
  it('fact 5: an accepted but undecided operation is listed and queryable, and attach fences it out', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const commit = commitAt(await load(journal.port, opened.execution), opened.authority, 'late')
    journal.failNext('commit', { kind: 'commit-unknown', outcome: 'pending' })
    failure(await journal.port.commit(commit))
    const query = { ...access, execution: opened.execution, operation: commit.operation }

    expect((await load(journal.port, opened.execution)).unresolved).toEqual([commit.operation])
    expect(ok(await journal.port.query(query))).toEqual({ kind: 'unknown' })

    ok(await takeover(journal.port, opened))
    expect((await load(journal.port, opened.execution)).unresolved).toEqual([])
    expect(ok(await journal.port.query(query)).kind).toBe('excluded')
    expect(journal.settle(opened.execution, commit.operation, 'applied')).toBe(false)
  })

  it('fact 5: after attach the old attachment gets stale-advance from commit, tryFinish and detach', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const taken = ok(await takeover(journal, opened))
    const snapshot = await load(journal, opened.execution)
    expect(snapshot.executionAttachment).toEqual(taken.authority)

    expect(
      failure(await journal.commit(commitAt(snapshot, opened.authority, 'old-commit'))),
    ).toEqual({
      kind: 'stale-advance',
    })
    expect(
      failure(await journal.tryFinish(await finishInput(journal, opened, 'old-finish'))),
    ).toEqual({
      kind: 'stale-advance',
    })
    expect(
      failure(
        await journal.detach({
          ...access,
          execution: opened.execution,
          operation: operation('old-detach'),
          authority: opened.authority,
          reason: evidence('reason'),
        }),
      ),
    ).toEqual({ kind: 'stale-advance' })
  })

  it('fact 5: attach on an active attachment without a takeover evidence returns changed', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const before = await load(journal, opened.execution)
    expect(
      failure(
        await journal.attach({
          ...access,
          execution: opened.execution,
          operation: operation('resume'),
          instance: instance('instance-2'),
          grant: null,
          recovery: evidence('recovery'),
          takeover: null,
        }),
      ),
    ).toEqual({ kind: 'changed' })
    expect(await load(journal, opened.execution)).toEqual(before)
  })

  it('fact 5: detach suspends the execution, and a later attach recovers without a takeover evidence', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const detach = {
      ...access,
      execution: opened.execution,
      operation: operation('detach'),
      authority: opened.authority,
      reason: evidence('pause'),
    }
    const handoff = ok(await journal.detach(detach))
    expect((await load(journal, opened.execution)).state).toEqual({ kind: 'suspended', handoff })
    // A detached attachment only recognizes its handoff.
    expect(ok(await journal.detach({ ...detach, operation: operation('detach-again') }))).toEqual(
      handoff,
    )

    const resumed = ok(
      await journal.attach({
        ...access,
        execution: opened.execution,
        operation: operation('resume'),
        instance: instance('instance-2'),
        grant: null,
        recovery: evidence('recovery'),
        takeover: null,
      }),
    )
    const snapshot = await load(journal, opened.execution)
    expect(snapshot.state).toEqual({ kind: 'reconciling' })
    expect(snapshot.executionAttachment).toEqual(resumed.authority)
  })

  it('fact 5: attach fences out a commit whose participant could not tell', async () => {
    const journal = memory({ participants: ['message'] })
    const opened = await open(journal.port)
    const commit = commitAt(await load(journal.port, opened.execution), opened.authority, 'joint', {
      caller: {
        kind: 'message',
        message: acceptedInput('m').content,
        source: evidence('source'),
        admission: evidence('admission'),
      },
    })
    journal.respond('message', 'fail-unknown')
    failure(await journal.port.commit(commit))
    ok(await takeover(journal.port, opened))
    expect(
      ok(
        await journal.port.query({
          ...access,
          execution: opened.execution,
          operation: commit.operation,
        }),
      ).kind,
    ).toBe('excluded')
    expect(journal.settle(opened.execution, commit.operation, 'applied')).toBe(false)
    expect(journal.joint()).toEqual([])
  })
})

describe('fact 6: revision', () => {
  it('fact 6: the revision increases with every write and is never reused', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const seen = [opened.receipt.revision]
    for (const name of ['a', 'b', 'c']) {
      const receipt = ok(
        await journal.commit(
          commitAt(await load(journal, opened.execution), opened.authority, name),
        ),
      )
      seen.push(receipt.revision)
    }
    const taken = ok(await takeover(journal, opened))
    seen.push(taken.receipt.revision)
    const numbers = seen.map(Number)
    expect(numbers).toEqual([...numbers].sort((left, right) => left - right))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('fact 6: load returns one complete snapshot of one revision', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const snapshot = await load(journal, opened.execution)
    expect(snapshot.revision).toBe(opened.receipt.revision)
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        'checkpoint',
        'controls',
        'effects',
        'entries',
        'execution',
        'executionAttachment',
        'history',
        'inputWatermark',
        'output',
        'replyAdmissions',
        'results',
        'revision',
        'state',
        'terminalObservations',
        'unresolved',
      ].sort(),
    )
    expect(await load(journal, opened.execution)).toEqual(snapshot)
  })
})

describe('fact 7: event sequence and cursor', () => {
  it('fact 7: events are numbered from 1 without gaps, and read pages by after, next and caughtUp', async () => {
    const { port: journal } = memory({ readLimit: 2 })
    const opened = await open(journal)
    const waiting = { kind: 'waiting', waits: [] } as const
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'events', {
          events: [waiting, waiting, waiting],
        }),
      ),
    )
    const read = (after: string | null, limit = 2) =>
      journal.output.read({ ...access, execution: opened.execution, after, limit })

    const first = ok(await read(null))
    expect(first).toEqual(ok(await read('0')))
    if (first.kind !== 'page') throw new Error('expected a page')
    expect(first.events.map(event => event.sequence)).toEqual(['1', '2'])
    expect(first).toMatchObject({ next: '2', caughtUp: false })
    expect(ok(await read('2'))).toMatchObject({ kind: 'page', next: '3', caughtUp: true })
    expect(ok(await read('3'))).toEqual({ kind: 'page', events: [], next: '3', caughtUp: true })
    expect(failure(await read('4')).kind).toBe('invalid')
    expect(failure(await read(null, 3)).kind).toBe('invalid')
  })

  it('fact 7: a dropped prefix reads as a gap, not as an empty page', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const waiting = { kind: 'waiting', waits: [] } as const
    ok(
      await journal.port.commit(
        commitAt(await load(journal.port, opened.execution), opened.authority, 'events', {
          events: [waiting, waiting],
        }),
      ),
    )
    ok(
      await journal.port.acknowledge({
        ...access,
        execution: opened.execution,
        operation: operation('ack'),
        through: '1',
        receipt: null,
      }),
    )
    expect(journal.applyRetention(opened.execution)).toBe(1)

    const gap = ok(
      await journal.port.output.read({
        ...access,
        execution: opened.execution,
        after: null,
        limit: 10,
      }),
    )
    expect(gap).toMatchObject({ kind: 'gap', retainedFrom: '2' })
    expect(
      ok(
        await journal.port.output.read({
          ...access,
          execution: opened.execution,
          after: '1',
          limit: 10,
        }),
      ),
    ).toMatchObject({
      kind: 'page',
      next: '2',
    })
  })

  it('fact 7: acknowledgement accepts only a monotone prefix of the emitted events', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const waiting = { kind: 'waiting', waits: [] } as const
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'events', {
          events: [waiting, waiting],
        }),
      ),
    )
    const acknowledge = (name: string, through: string) =>
      journal.acknowledge({
        ...access,
        execution: opened.execution,
        operation: operation(name),
        through,
        receipt: null,
      })

    ok(await acknowledge('ack-2', '2'))
    ok(await acknowledge('ack-1', '1'))
    expect((await load(journal, opened.execution)).output).toEqual({
      emittedThrough: '2',
      acknowledgedThrough: '2',
    })
    expect(failure(await acknowledge('ack-3', '3')).kind).toBe('invalid')
  })

  it('fact 7: events delivers committed pages and ends after the ended event', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const signal = new AbortController().signal
    const pages: string[][] = []
    const reading = (async () => {
      for await (const page of journal.output.events({
        ...access,
        execution: opened.execution,
        after: null,
        signal,
      })) {
        const value = ok(page)
        if (value.kind === 'page') pages.push(value.events.map(event => event.body.kind))
      }
    })()
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'events', {
          events: [{ kind: 'waiting', waits: [] }],
        }),
      ),
    )
    ok(await finish(journal, opened))
    await reading
    expect(pages.flat()).toEqual(['waiting', 'ended'])
  })
})

describe('fact 8: inputs', () => {
  it('fact 8: one watermark returns one batch with the content saved at acceptance', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.submit({
        ...access,
        execution: opened.execution,
        operation: operation('submit'),
        value: acceptedInput('input-2', 'second'),
      }),
    )
    const watermark = (await load(journal, opened.execution)).inputWatermark

    const first = ok(await journal.inputs({ ...access, execution: opened.execution, watermark }))
    ok(
      await journal.submit({
        ...access,
        execution: opened.execution,
        operation: operation('submit-3'),
        value: acceptedInput('input-3'),
      }),
    )
    const second = ok(await journal.inputs({ ...access, execution: opened.execution, watermark }))

    expect(second).toEqual(first)
    expect(first.batch.ordered).toEqual([acceptedInput('input-1').id, acceptedInput('input-2').id])
    expect(first.messages).toEqual([
      acceptedInput('input-1').content,
      acceptedInput('input-2', 'second').content,
    ])
  })

  it('fact 8: the same input identity with other content is a conflict, and with the same content the original acceptance', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const value = acceptedInput('input-2', 'second')
    ok(
      await journal.submit({
        ...access,
        execution: opened.execution,
        operation: operation('submit-a'),
        value,
      }),
    )
    ok(
      await journal.submit({
        ...access,
        execution: opened.execution,
        operation: operation('submit-b'),
        value,
      }),
    )
    expect(
      failure(
        await journal.submit({
          ...access,
          execution: opened.execution,
          operation: operation('submit-c'),
          value: acceptedInput('input-2', 'changed'),
        }),
      ),
    ).toEqual({ kind: 'conflict', operation: operation('submit-c') })
    const watermark = (await load(journal, opened.execution)).inputWatermark
    expect(
      ok(await journal.inputs({ ...access, execution: opened.execution, watermark })).batch.ordered,
    ).toHaveLength(2)
  })
})

describe('fact 9: participant declaration', () => {
  it('fact 9: the declared participants do not change after construction', () => {
    const declared: ('message' | 'custody')[] = ['message']
    const journal = memory({ participants: declared })
    declared.push('custody')
    expect([...journal.port.capabilities.participants]).toEqual(['message'])
    expect(journal.port.capabilities.participants.has('custody')).toBe(false)
  })

  it('fact 9: an undeclared caller kind is unsupported before anything is saved', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const before = await load(journal, opened.execution)
    const commit = commitAt(before, opened.authority, 'message', {
      caller: {
        kind: 'message',
        message: acceptedInput('m').content,
        source: evidence('source'),
        admission: evidence('admission'),
      },
    })
    expect(failure(await journal.commit(commit))).toEqual({ kind: 'unsupported' })
    expect(await load(journal, opened.execution)).toEqual(before)
  })

  it('fact 9: the four participant responses return a receipt, unavailable, changed and unsupported', async () => {
    const journal = memory({ participants: ['message'] })
    const opened = await open(journal.port)
    const caller = {
      kind: 'message',
      message: acceptedInput('m').content,
      source: evidence('source'),
      admission: evidence('admission'),
    } as const
    const attempt = async (name: string) =>
      journal.port.commit(
        commitAt(await load(journal.port, opened.execution), opened.authority, name, { caller }),
      )

    journal.respond('message', 'fail')
    expect(failure(await attempt('fail')).kind).toBe('unavailable')
    journal.respond('message', 'conflict')
    expect(failure(await attempt('conflict'))).toEqual({ kind: 'changed' })
    journal.respond('message', 'unsupported')
    expect(failure(await attempt('unsupported'))).toEqual({ kind: 'unsupported' })
    expect(journal.joint()).toEqual([])
    expect((await load(journal.port, opened.execution)).revision).toBe(opened.receipt.revision)

    journal.respond('message', 'participate')
    ok(await attempt('participate'))
    expect(journal.joint()).toEqual([
      { execution: opened.execution, operation: operation('participate'), caller },
    ])
  })
})

describe('fact 10: the one terminal commit', () => {
  it('fact 10: tryFinish ends the execution, and the retry of the same operation recognizes the original end', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(await takeInputs(journal, opened))
    const input = await finishInput(journal, opened)
    const ended = ok(await journal.tryFinish(input))
    expect(ended.kind).toBe('ended')
    expect((await load(journal, opened.execution)).state.kind).toBe('ended')
    expect(ok(await journal.tryFinish(input))).toEqual(ended)
  })

  it('fact 10: commit, recordResult, recordControl and detach leave the execution not ended', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'step'),
      ),
    )
    ok(
      await journal.recordResult({
        ...access,
        execution: opened.execution,
        operation: operation('result'),
        result: producedResult('c1'),
        consumption: consumption('k1'),
        transfer: { kind: 'none' },
        release: { kind: 'pending' },
      }),
    )
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('stage'),
        target: operation('cancel'),
        stage: 'qualification-revoked',
        state: 'reached',
        source: evidence('revoked'),
      }),
    )
    ok(
      await journal.detach({
        ...access,
        execution: opened.execution,
        operation: operation('detach'),
        authority: opened.authority,
        reason: evidence('reason'),
      }),
    )
    expect((await load(journal, opened.execution)).state.kind).toBe('suspended')
  })

  it('fact 10: an input accepted after the intent watermark makes tryFinish return changed', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const snapshot = await load(journal, opened.execution)
    ok(
      await journal.submit({
        ...access,
        execution: opened.execution,
        operation: operation('late-input'),
        value: acceptedInput('input-2'),
      }),
    )
    const current = await load(journal, opened.execution)
    const result = ok(
      await journal.tryFinish({
        ...access,
        execution: opened.execution,
        operation: operation('finish'),
        authorization: { kind: 'advancement', authority: opened.authority },
        expected: current.revision,
        intent: {
          conclusion: { kind: 'complete' },
          inputWatermark: snapshot.inputWatermark,
          obligations: evidence('obligations'),
          beforeTerminal: evidence('before-terminal'),
          failure: null,
        },
      }),
    )
    expect(result.kind).toBe('changed')
    expect((await load(journal, opened.execution)).state.kind).not.toBe('ended')
  })

  it('fact 10: a result without custody or completion blocks the end with reason custody', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.recordResult({
        ...access,
        execution: opened.execution,
        operation: operation('result'),
        result: producedResult('c1'),
        consumption: consumption('k1'),
        transfer: { kind: 'none' },
        release: { kind: 'pending' },
      }),
    )
    expect(ok(await finish(journal, opened))).toMatchObject({ kind: 'blocked', reason: 'custody' })
  })

  it('fact 10: an effective cancel takes precedence, and only the cancel authorization ends with cancelled', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('intent'),
        target: operation('cancel'),
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    expect(ok(await finish(journal, opened, 'complete')).kind).toBe('changed')

    const snapshot = await load(journal, opened.execution)
    const ended = ok(
      await journal.tryFinish({
        ...access,
        execution: opened.execution,
        operation: operation('cancelled'),
        authorization: { kind: 'cancel', control: operation('cancel'), source: evidence('cancel') },
        expected: snapshot.revision,
        intent: {
          conclusion: { kind: 'cancelled', cause: evidence('cause') },
          inputWatermark: snapshot.inputWatermark,
          obligations: evidence('obligations'),
          beforeTerminal: evidence('before-terminal'),
          failure: null,
        },
      }),
    )
    expect(ended.kind).toBe('ended')
    expect((await load(journal, opened.execution)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'cancelled' },
    })
  })

  it('fact 10 临时做法，待 #558 裁定：no event follows the ended event; a later stage fact is recorded without one', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('intent'),
        target: operation('cancel'),
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    const snapshot = await load(journal, opened.execution)
    ok(
      await journal.tryFinish({
        ...access,
        execution: opened.execution,
        operation: operation('cancelled'),
        authorization: { kind: 'cancel', control: operation('cancel'), source: evidence('cancel') },
        expected: snapshot.revision,
        intent: {
          conclusion: { kind: 'cancelled', cause: evidence('cause') },
          inputWatermark: snapshot.inputWatermark,
          obligations: evidence('obligations'),
          beforeTerminal: evidence('before-terminal'),
          failure: null,
        },
      }),
    )
    // 临时做法，待 #558 裁定：ended 之后的阶段事实照常记录，不投影事件。
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('stopped'),
        target: operation('cancel'),
        stage: 'physically-stopped',
        state: 'reached',
        source: evidence('stopped'),
      }),
    )
    const after = await load(journal, opened.execution)
    expect(after.controls[0]?.stages['physically-stopped']).toEqual({
      state: 'reached',
      source: evidence('stopped'),
    })
    const page = ok(
      await journal.output.read({
        ...access,
        execution: opened.execution,
        after: null,
        limit: 100,
      }),
    )
    if (page.kind !== 'page') throw new Error('expected a page')
    expect(page.events.at(-1)?.body.kind).toBe('ended')
    expect(page.events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
  })

  it('fact 10: a pending write of the execution blocks the end with reason operations', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    ok(await takeInputs(journal.port, opened))
    journal.failNext('acknowledge', { kind: 'commit-unknown', outcome: 'pending' })
    failure(
      await journal.port.acknowledge({
        ...access,
        execution: opened.execution,
        operation: operation('ack'),
        through: '1',
        receipt: null,
      }),
    )
    expect(ok(await journal.port.tryFinish(await finishInput(journal.port, opened)))).toMatchObject(
      {
        kind: 'blocked',
        reason: 'operations',
      },
    )
  })

  it('fact 10 临时做法，待 #558 裁定：an applicable stage recorded unresolved blocks the end with reason controls', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('suspend'),
        command: { kind: 'suspend', reason: evidence('reason') },
      }),
    )
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('revoked'),
        target: operation('suspend'),
        stage: 'qualification-revoked',
        state: 'unresolved',
        source: evidence('unknown'),
      }),
    )
    expect(ok(await finish(journal, opened))).toMatchObject({ kind: 'blocked', reason: 'controls' })
  })

  it('fact 10 临时做法，待 #558 裁定：untaken inputs block an ordinary end with reason inputs, not a cancel', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    expect(
      ok(await journal.tryFinish(await finishInput(journal, opened, 'complete'))),
    ).toMatchObject({
      kind: 'blocked',
      reason: 'inputs',
    })
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('intent'),
        target: operation('cancel'),
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    const snapshot = await load(journal, opened.execution)
    const cancelled = ok(
      await journal.tryFinish({
        ...access,
        execution: opened.execution,
        operation: operation('cancelled'),
        authorization: { kind: 'cancel', control: operation('cancel'), source: evidence('cancel') },
        expected: snapshot.revision,
        intent: {
          conclusion: { kind: 'cancelled', cause: evidence('cause') },
          inputWatermark: snapshot.inputWatermark,
          obligations: evidence('obligations'),
          beforeTerminal: evidence('before-terminal'),
          failure: null,
        },
      }),
    )
    expect(cancelled.kind).toBe('ended')
  })

  it('fact 10 临时做法，待 #558 裁定：passages is not checked, so an open before-terminal passage does not block the end', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const passage = { ...afterTerminalPassage('before'), position: 'before_terminal' } as const
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'with-passage', {
          checkpoint: checkpoint('F2', [passage]),
        }),
      ),
    )
    expect(ok(await finish(journal, opened)).kind).toBe('ended')
  })
})

describe('fact 11: result responsibility', () => {
  it('fact 11: recordResult needs no attachment, works after ended and leaves the checkpoint alone', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(await finish(journal, opened))
    const before = await load(journal, opened.execution)
    const result = producedResult('late')
    ok(
      await journal.recordResult({
        ...access,
        execution: opened.execution,
        operation: operation('late-result'),
        result,
        consumption: consumption('k1'),
        transfer: {
          kind: 'processed',
          result,
          consumption: consumption('k1'),
          completion: evidence('done'),
        },
        release: { kind: 'confirmed', receipt: evidence('producer-ack') },
      }),
    )
    const after = await load(journal, opened.execution)
    expect(after.checkpoint).toEqual(before.checkpoint)
    expect(after.results).toEqual([
      {
        result,
        consumption: consumption('k1'),
        custody: null,
        completion: evidence('done'),
        release: { kind: 'confirmed', receipt: evidence('producer-ack') },
      },
    ])
  })

  it('fact 11: a transfer for another result or consumption, and a confirmed release without custody or completion, are refused', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const result = producedResult('c1')
    const base = {
      ...access,
      execution: opened.execution,
      result,
      consumption: consumption('k1'),
    }
    expect(
      failure(
        await journal.recordResult({
          ...base,
          operation: operation('other-result'),
          transfer: {
            kind: 'custody',
            result: producedResult('c2'),
            consumption: consumption('k1'),
            retained: evidence('kept'),
          },
          release: { kind: 'pending' },
        }),
      ).kind,
    ).toBe('conflict')
    expect(
      failure(
        await journal.recordResult({
          ...base,
          operation: operation('confirmed-alone'),
          transfer: { kind: 'none' },
          release: { kind: 'confirmed', receipt: evidence('ack') },
        }),
      ).kind,
    ).toBe('conflict')
    expect((await load(journal, opened.execution)).results).toEqual([])
  })
})

describe('fact 12: post-terminal observation', () => {
  it('fact 12: an observation registers only for an existing item, recognizes the same value, refuses another and appends no event', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const passage = afterTerminalPassage('observer-1')
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'with-passage', {
          checkpoint: checkpoint('F2', [passage]),
        }),
      ),
    )
    ok(await finish(journal, opened))
    const ended = await load(journal, opened.execution)
    const [item] = ended.terminalObservations
    expect(item).toMatchObject({ passage: passage.id, observed: null })
    if (item === undefined) throw new Error('expected one observation item')
    const register = (name: string, observed: string) =>
      journal.recordTerminalObservation({
        ...access,
        execution: opened.execution,
        operation: operation(name),
        terminal: item.terminal,
        passage: item.passage,
        implementation: item.implementation,
        observed: evidence(observed),
      })

    const first = ok(await register('observe-1', 'seen'))
    expect(ok(await register('observe-2', 'seen'))).toEqual(first)
    expect(failure(await register('observe-3', 'other')).kind).toBe('conflict')
    const after = await load(journal, opened.execution)
    expect(after.terminalObservations[0]?.observed).toEqual(evidence('seen'))
    expect(after.output.emittedThrough).toBe(ended.output.emittedThrough)
    expect(
      failure(
        await journal.recordTerminalObservation({
          ...access,
          execution: opened.execution,
          operation: operation('observe-unknown'),
          terminal: item.terminal,
          passage: afterTerminalPassage('not-there').id,
          implementation: item.implementation,
          observed: evidence('seen'),
        }),
      ).kind,
    ).toBe('invalid')
  })
})

describe('fact 13: reply admission projection', () => {
  it('fact 13: rejections count, an admission resets the run, a retry adds nothing and another decision conflicts', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const commitWith = async (name: string, admission: ReturnType<typeof replyAdmission>) =>
      journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, name, {
          replyAdmission: admission,
        }),
      )

    ok(await commitWith('r1', replyAdmission('c1', 'rejected')))
    ok(await commitWith('r2', replyAdmission('c2', 'rejected')))
    ok(await commitWith('r2-retry', replyAdmission('c2', 'rejected')))
    expect((await load(journal, opened.execution)).replyAdmissions).toMatchObject({
      consecutiveDenials: '2',
      totalDenials: '2',
      lastAdmission: null,
    })

    ok(await commitWith('a3', replyAdmission('c3', 'admitted')))
    const projection = (await load(journal, opened.execution)).replyAdmissions
    expect(projection).toMatchObject({
      consecutiveDenials: '0',
      totalDenials: '2',
      lastAdmission: replyAdmission('c3', 'admitted').source,
    })
    expect(projection.through.record).not.toBe('')
    expect(projection.rule.name).not.toBe('')

    expect(failure(await commitWith('c2-flip', replyAdmission('c2', 'admitted')))).toEqual({
      kind: 'conflict',
      operation: operation('c2-flip'),
    })

    const page = ok(
      await journal.readReplyAdmissions({
        ...access,
        execution: opened.execution,
        through: projection.through,
        after: null,
        limit: 2,
      }),
    )
    expect(page).toMatchObject({ kind: 'page', next: '2', complete: false })
    if (page.kind !== 'page') throw new Error('expected a page')
    expect(page.items.map(item => [item.sequence, item.fact.call])).toEqual([
      ['1', modelCall('c1')],
      ['2', modelCall('c2')],
    ])
  })
})

describe('fact 14: denied', () => {
  it('fact 14: open denies a grant that no participant can check, and a missing grant when one is required', async () => {
    const strict = memory({ requireGrant: true }).port
    const loose = memory().port
    const input = {
      ...access,
      execution: execution(),
      operation: operation('open'),
      instance: instance(),
      initial: acceptedInput('input-1'),
      checkpoint: checkpoint(),
    }
    expect(failure(await strict.open({ ...input, grant: null }))).toEqual({
      kind: 'denied',
      action: 'open',
    })
    expect(failure(await loose.open({ ...input, grant: evidence('grant') }))).toEqual({
      kind: 'denied',
      action: 'open',
    })
    expect(failure(await loose.load({ ...access, execution: execution() })).kind).toBe('denied')
  })

  it('fact 14: attach denies a grant that fails its check and writes nothing', async () => {
    const { port: journal } = memory({ grant: input => input.grant.record === 'good' })
    const opened = ok(
      await journal.open({
        ...access,
        execution: execution(),
        operation: operation('open'),
        instance: instance(),
        grant: evidence('good'),
        initial: acceptedInput('input-1'),
        checkpoint: checkpoint(),
      }),
    )
    const before = await load(journal, execution())
    expect(
      failure(
        await journal.attach({
          ...access,
          execution: execution(),
          operation: operation('attach'),
          instance: instance('instance-2'),
          grant: evidence('bad'),
          recovery: evidence('recovery'),
          takeover: evidence('takeover'),
        }),
      ).kind,
    ).toBe('denied')
    expect(await load(journal, execution())).toEqual(before)
    expect(opened.authority.generation).toBe('1')
  })

  it('fact 14: recordResult denies a caller that is not the custodian, recordTerminalObservation one that may not observe', async () => {
    const { port: journal } = memory({ custodian: () => false, observer: () => false })
    const opened = await open(journal)
    const before = await load(journal, opened.execution)
    expect(
      failure(
        await journal.recordResult({
          ...access,
          execution: opened.execution,
          operation: operation('result'),
          result: producedResult('c1'),
          consumption: consumption('k1'),
          transfer: { kind: 'none' },
          release: { kind: 'pending' },
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'recordResult' })
    expect(
      failure(
        await journal.recordTerminalObservation({
          ...access,
          execution: opened.execution,
          operation: operation('observe'),
          terminal: evidence('terminal'),
          passage: afterTerminalPassage('p').id,
          implementation: afterTerminalPassage('p').implementation,
          observed: evidence('seen'),
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'recordTerminalObservation' })
    expect(await load(journal, opened.execution)).toEqual(before)
  })

  it('fact 14: another tenant is denied without telling whether the execution exists', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    expect(failure(await journal.load({ ...otherTenant, execution: opened.execution }))).toEqual(
      failure(await journal.load({ ...otherTenant, execution: execution('missing') })),
    )
    expect(
      failure(
        await journal.submit({
          ...otherTenant,
          execution: opened.execution,
          operation: operation('s'),
          value: acceptedInput('x'),
        }),
      ).kind,
    ).toBe('denied')
  })

  it('fact 14: query answers another tenant the same for an existing and a missing execution, and its own tenant a pending open', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const existing = await journal.port.query({
      ...otherTenant,
      execution: opened.execution,
      operation: operation('x'),
    })
    const missing = await journal.port.query({
      ...otherTenant,
      execution: execution('missing'),
      operation: operation('x'),
    })
    expect(failure(existing)).toEqual({ kind: 'denied', action: 'query' })
    expect(missing).toEqual(existing)

    journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    const pendingOpen = {
      ...access,
      execution: execution('exec-pending'),
      operation: operation('open-pending'),
      instance: instance(),
      grant: null,
      initial: acceptedInput('input-1'),
      checkpoint: checkpoint(),
    }
    failure(await journal.port.open(pendingOpen))
    const query = { execution: pendingOpen.execution, operation: pendingOpen.operation }
    expect(ok(await journal.port.query({ ...access, ...query }))).toEqual({ kind: 'unknown' })
    expect(failure(await journal.port.query({ ...otherTenant, ...query }))).toEqual({
      kind: 'denied',
      action: 'query',
    })
  })

  it('fact 14: a write of another tenant is denied before any scripted fault and never becomes pending', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const commit = commitAt(
      await load(journal.port, opened.execution),
      opened.authority,
      'b-commit',
    )
    journal.failNext('commit', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await journal.port.commit({ ...commit, ...otherTenant }))).toEqual({
      kind: 'denied',
      action: 'commit',
    })
    expect((await load(journal.port, opened.execution)).unresolved).toEqual([])
    expect(
      failure(
        await journal.port.query({
          ...otherTenant,
          execution: opened.execution,
          operation: commit.operation,
        }),
      ),
    ).toEqual({ kind: 'denied', action: 'query' })
    expect(journal.settle(opened.execution, commit.operation, 'applied')).toBe(false)
    // The fault was spent on the denied call, so the owner's commit is an ordinary write.
    ok(await journal.port.commit(commit))
    expect((await load(journal.port, opened.execution)).unresolved).toEqual([])
  })

  it('fact 14: open with a tenant that legal-identity did not mint is denied and opens nothing', async () => {
    const { port: journal } = memory()
    const input = {
      ...access,
      execution: execution(),
      operation: operation('open'),
      instance: instance(),
      grant: null,
      initial: acceptedInput('input-1'),
      checkpoint: checkpoint(),
    }
    expect(failure(await journal.open({ ...input, tenant: { ...access.tenant } }))).toEqual({
      kind: 'denied',
      action: 'open',
    })
    // The minted tenant opens the same identity as a first open, not as a recognition or conflict.
    const opened = ok(await journal.open(input))
    expect(opened.authority.generation).toBe('1')
    expect((await load(journal, input.execution)).revision).toBe(opened.receipt.revision)
  })
})

describe('fact 15: terminal', () => {
  it('fact 15: after ended, attach and submit return terminal and control only recognizes the end', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const control = {
      ...access,
      execution: opened.execution,
      operation: operation('interrupt-before-end'),
      command: { kind: 'suspend', reason: evidence('reason') },
    } as const
    const accepted = ok(await journal.control(control))
    ok(await finish(journal, opened))

    expect(failure(await takeover(journal, opened))).toEqual({ kind: 'terminal' })
    expect(
      failure(
        await journal.submit({
          ...access,
          execution: opened.execution,
          operation: operation('late'),
          value: acceptedInput('input-9'),
        }),
      ),
    ).toEqual({ kind: 'terminal' })
    expect(
      failure(
        await journal.control({
          ...control,
          operation: operation('cancel-after-end'),
          command: { kind: 'cancel', reason: evidence('r') },
        }),
      ),
    ).toEqual({ kind: 'terminal' })
    expect(ok(await journal.control(control))).toEqual(accepted)
  })
})

describe('临时做法，待 #558 裁定', () => {
  it('M04-4 临时做法，待 #558 裁定：commit 与六个记录方法成功写入时都推进 revision，同操作重试认回原回执、不推进', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    const revision = async () => Number((await load(journal, opened.execution)).revision)
    const advances = async (write: () => Promise<unknown>) => {
      const before = await revision()
      await write()
      const middle = await revision()
      await write()
      return [middle - before, (await revision()) - middle]
    }
    const passage = afterTerminalPassage('observer')
    const snapshot = await load(journal, opened.execution)
    const commit = commitAt(snapshot, opened.authority, 'commit', {
      checkpoint: checkpoint('F2', [passage]),
    })
    expect(await advances(() => journal.commit(commit))).toEqual([1, 0])
    const submit = {
      ...access,
      execution: opened.execution,
      operation: operation('submit'),
      value: acceptedInput('input-2'),
    }
    expect(await advances(() => journal.submit(submit))).toEqual([1, 0])
    const control = {
      ...access,
      execution: opened.execution,
      operation: operation('control'),
      command: { kind: 'cancel', reason: evidence('reason') },
    } as const
    expect(await advances(() => journal.control(control))).toEqual([1, 0])
    const ack = {
      ...access,
      execution: opened.execution,
      operation: operation('ack'),
      through: '1',
      receipt: null,
    }
    expect(await advances(() => journal.acknowledge(ack))).toEqual([1, 0])
    const result = {
      ...access,
      execution: opened.execution,
      operation: operation('result'),
      result: producedResult('c1'),
      consumption: consumption('k1'),
      transfer: {
        kind: 'processed',
        result: producedResult('c1'),
        consumption: consumption('k1'),
        completion: evidence('done'),
      },
      release: { kind: 'pending' },
    } as const
    expect(await advances(() => journal.recordResult(result))).toEqual([1, 0])
    const stage = {
      ...access,
      execution: opened.execution,
      operation: operation('stage'),
      target: operation('control'),
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    } as const
    expect(await advances(() => journal.recordControl(stage))).toEqual([1, 0])

    const current = await load(journal, opened.execution)
    ok(
      await journal.tryFinish({
        ...access,
        execution: opened.execution,
        operation: operation('cancelled'),
        authorization: {
          kind: 'cancel',
          control: operation('control'),
          source: evidence('cancel'),
        },
        expected: current.revision,
        intent: {
          conclusion: { kind: 'cancelled', cause: evidence('cause') },
          inputWatermark: current.inputWatermark,
          obligations: evidence('obligations'),
          beforeTerminal: evidence('before-terminal'),
          failure: null,
        },
      }),
    )
    const [item] = (await load(journal, opened.execution)).terminalObservations
    if (item === undefined) throw new Error('expected one observation item')
    const observe = {
      ...access,
      execution: opened.execution,
      operation: operation('observe'),
      terminal: item.terminal,
      passage: item.passage,
      implementation: item.implementation,
      observed: evidence('seen'),
    }
    expect(await advances(() => journal.recordTerminalObservation(observe))).toEqual([1, 0])
  })

  it('M04-5 临时做法，待 #558 裁定：未声明参加者时 recordResult.transfer 的 custody 与 processed 由提供者建立依据，commit.caller 的同种类返回 unsupported', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    expect(journal.capabilities.participants.size).toBe(0)
    const result = producedResult('c1')
    ok(
      await journal.recordResult({
        ...access,
        execution: opened.execution,
        operation: operation('custody'),
        result,
        consumption: consumption('k1'),
        transfer: {
          kind: 'custody',
          result,
          consumption: consumption('k1'),
          retained: evidence('material'),
        },
        release: { kind: 'pending' },
      }),
    )
    const snapshot = await load(journal, opened.execution)
    expect(snapshot.results).toMatchObject([{ custody: evidence('material'), completion: null }])

    const caller = {
      kind: 'custody',
      result,
      consumption: consumption('k1'),
      retained: evidence('material'),
    } as const
    expect(
      failure(await journal.commit(commitAt(snapshot, opened.authority, 'joint', { caller }))),
    ).toEqual({
      kind: 'unsupported',
    })
    expect(await load(journal, opened.execution)).toEqual(snapshot)
  })

  it('M04-7 临时做法，待 #558 裁定：open 不追加事件，第一个序号属于之后的一次提交', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    expect((await load(journal, opened.execution)).output.emittedThrough).toBeNull()
    ok(
      await journal.commit(
        commitAt(await load(journal, opened.execution), opened.authority, 'i0', {
          events: [{ kind: 'waiting', waits: [] }],
        }),
      ),
    )
    const page = ok(
      await journal.output.read({ ...access, execution: opened.execution, after: null, limit: 10 }),
    )
    if (page.kind !== 'page') throw new Error('expected a page')
    expect(page.events.map(event => [event.sequence, event.body.kind])).toEqual([['1', 'waiting']])
  })

  it('M04-1 的读法 临时做法，待 #558 裁定：control 与 recordControl 把阶段事实投影为 control 事件', async () => {
    const { port: journal } = memory()
    const opened = await open(journal)
    ok(
      await journal.control({
        ...access,
        execution: opened.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('reason') },
      }),
    )
    ok(
      await journal.recordControl({
        ...access,
        execution: opened.execution,
        operation: operation('intent'),
        target: operation('cancel'),
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    const page = ok(
      await journal.output.read({ ...access, execution: opened.execution, after: null, limit: 10 }),
    )
    if (page.kind !== 'page') throw new Error('expected a page')
    expect(
      page.events.map(event =>
        event.body.kind === 'control' ? [event.body.operation, event.body.stage] : [],
      ),
    ).toEqual([
      [operation('cancel'), 'accepted'],
      [operation('cancel'), 'intent-established'],
    ])
  })
})

describe('scripted read faults', () => {
  it('a scripted read fault returns unavailable once and saves nothing', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    journal.failNextRead('load')
    expect(failure(await journal.port.load({ ...access, execution: opened.execution })).kind).toBe(
      'unavailable',
    )
    ok(await journal.port.load({ ...access, execution: opened.execution }))
  })

  it('a scripted write fault unavailable saves nothing', async () => {
    const journal = memory()
    const opened = await open(journal.port)
    const before = await load(journal.port, opened.execution)
    journal.failNext('commit', { kind: 'unavailable' })
    expect(failure(await journal.port.commit(commitAt(before, opened.authority, 'x'))).kind).toBe(
      'unavailable',
    )
    expect(await load(journal.port, opened.execution)).toEqual(before)
  })
})

// Public controls establish corrupted storage; the real Journal remains the behavior oracle.
describe('retained invocation fault controls', () => {
  async function fixture(label = 'A', spaced = false) {
    const control = memory({ retainedToolInvocationFaults: true, participants: ['message'] })
    const journal = control.port
    const entries = []
    for (const id of ['fault-execution-1', 'fault-execution-2']) {
      const opened = await open(journal, id)
      const calls = ['first', 'second'].map(name => {
        const call = ok(toolReferences.decodeToolCallId(`${label}-${id}-${name}`))
        const parts = {
          tenant: access.tenant,
          call,
          admission: ok(toolReferences.decodeToolOperationId(`${label}-${id}-${name}-admission`)),
        }
        const reference = ok(toolReferences.encodeToolInvocationRef(parts))
        return { parts, reference, raw: spaced ? ` \n${reference} ` : reference }
      })
      const commit = commitAt(await load(journal, opened.execution), opened.authority, 'calls', {
        checkpoint: checkpoint(),
      })
      // JS callers can provide non-canonical valid text. The real resolver checks these bytes.
      const committed: Awaited<ReturnType<Journal['commit']>> = await Reflect.apply(
        journal.commit,
        journal,
        [
          {
            ...commit,
            checkpoint: {
              ...commit.checkpoint,
              calls: calls.map(({ parts, raw }) => ({
                action: ok(decodeActionId(parts.call)),
                consumption: consumption(parts.call),
                position: { owner: 'agent', work: id, position: 'T0', purpose: 'action' },
                fixed: evidence('request'),
                kind: 'tool',
                purpose: 'action',
                association: 'associated',
                reference: raw,
              })),
            },
          },
        ],
      )
      ok(committed)
      const selectors = []
      for (const [index, { parts, raw }] of calls.entries()) {
        expect(toolReferences.resolveToolInvocationRef(raw, access.tenant)).toEqual({ ok: parts })
        const accepted = {
          ...access,
          execution: opened.execution,
          operation: operation(index === 0 ? 'C' : 'C2'),
          command: { kind: 'interrupt-tool', call: parts.call, reason: evidence('reason') },
        } as const
        ok(await journal.control(accepted))
        selectors.push({
          tenant: access.tenant,
          execution: opened.execution,
          control: accepted.operation,
        })
      }
      ok(
        await journal.control({
          ...access,
          execution: opened.execution,
          operation: operation('suspend'),
          command: { kind: 'suspend', reason: evidence('suspend') },
        }),
      )
      const first = calls[0]
      const selector = selectors[0]
      const second = selectors[1]
      if (first === undefined || selector === undefined || second === undefined)
        throw new Error('fixture requires two calls')
      const recording = {
        ...access,
        execution: opened.execution,
        operation: operation('R'),
        target: selector.control,
        stage: 'producer-confirmed',
        state: 'reached',
        source: evidence('confirmed'),
      } as const
      const receipt = ok(await journal.recordControl(recording))
      entries.push({ opened, selector, second, first, recording, receipt })
    }
    const first = entries[0]
    const second = entries[1]
    if (first === undefined || second === undefined)
      throw new Error('fixture requires two executions')
    return { control, journal, entries, first, second }
  }

  async function observeAll(store: Awaited<ReturnType<typeof fixture>>) {
    const observations = []
    for (const { opened } of store.entries) {
      const events: AgentEvent[] = []
      let after: string | null = null
      for (;;) {
        const page: EventPage = ok(
          await store.journal.output.read({
            ...access,
            execution: opened.execution,
            after,
            limit: 1,
          }),
        )
        if (page.kind !== 'page') throw new Error('fixture must retain all events')
        events.push(...page.events)
        if (page.caughtUp) break
        after = page.next
      }
      const queries = []
      for (const name of [
        `open-${opened.execution}`,
        'calls',
        'C',
        'C2',
        'suspend',
        'R',
        'pending-R',
        'new-R',
      ]) {
        queries.push(
          ok(
            await store.journal.query({
              ...access,
              execution: opened.execution,
              operation: operation(name),
            }),
          ),
        )
      }
      observations.push({ snapshot: await load(store.journal, opened.execution), events, queries })
    }
    return observations
  }

  it('captures strict opt-in once and rejects disabled input without reading it', () => {
    const late = { retainedToolInvocationFaults: false }
    const disabled = memory(late)
    late.retainedToolInvocationFaults = true
    for (const option of [undefined, false, null, 0, 1, 'true']) {
      const instance: ReturnType<typeof memory> = Reflect.apply(
        createMemoryAgentJournal,
        undefined,
        [{ retainedToolInvocationFaults: option }],
      )
      for (const target of [disabled, instance]) {
        const hostile = {
          get tenant() {
            throw new Error('disabled control read input')
          },
        }
        expect(Reflect.apply(target.setRetainedToolInvocationFault, target, [hostile])).toEqual({
          kind: 'rejected',
          reason: 'disabled',
        })
        expect(Reflect.apply(target.setRetainedToolInvocationFault, target, [null])).toEqual({
          kind: 'rejected',
          reason: 'disabled',
        })
      }
    }
    const options = { retainedToolInvocationFaults: true }
    const enabled = memory(options)
    options.retainedToolInvocationFaults = false
    expect(
      enabled.setRetainedToolInvocationFault({
        tenant: access.tenant,
        execution: execution(),
        control: operation('C'),
        fault: null,
      }),
    ).toEqual({ kind: 'rejected', reason: 'target-unavailable' })
    const assembly = createTestAgentDependencies<string>({
      journal: { retainedToolInvocationFaults: true },
    })
    expect(
      assembly.controls.journal.setRetainedToolInvocationFault({
        tenant: access.tenant,
        execution: execution(),
        control: operation('C'),
        fault: null,
      }),
    ).toEqual({ kind: 'rejected', reason: 'target-unavailable' })
    expect('setRetainedToolInvocationFault' in assembly.controls.journal.port).toBe(false)
  })

  it('rejects invalid shapes before selection without changing storage or its recovery baseline', async () => {
    const store = await fixture()
    const s0 = await observeAll(store)
    const input = { ...store.first.selector, fault: { kind: 'malformed' } } as const
    expect(store.control.setRetainedToolInvocationFault(input)).toEqual({ kind: 'applied' })
    const s1 = await observeAll(store)
    const foreign = ok(
      toolReferences.encodeToolInvocationRef({
        ...store.first.first.parts,
        tenant: otherTenant.tenant,
      }),
    )
    const invalidInputs: readonly unknown[] = [
      null,
      undefined,
      [],
      'input',
      {},
      { ...input, tenant: {} },
      { ...input, tenant: undefined },
      { ...input, execution: '' },
      { ...input, execution: 'has space' },
      { ...input, control: 1 },
      { ...input, control: '' },
      { ...input, extra: true },
      { ...input, [Symbol('extra')]: true },
      { ...input, fault: undefined },
      { ...input, fault: false },
      { ...input, fault: [] },
      { ...input, fault: {} },
      { ...input, fault: { kind: 'other' } },
      { ...input, fault: { kind: 'malformed', reference: foreign } },
      { ...input, fault: { kind: 'foreign-tenant' } },
      { ...input, fault: { kind: 'foreign-tenant', reference: 'invalid' } },
      { ...input, fault: { kind: 'foreign-tenant', reference: 1 } },
      { ...input, fault: { kind: 'foreign-tenant', reference: store.first.first.reference } },
      { ...input, fault: { kind: 'foreign-tenant', reference: foreign, raw: foreign } },
      {
        ...input,
        get fault() {
          throw new Error('getter must not run')
        },
      },
      {
        ...input,
        fault: {
          get kind() {
            throw new Error('getter must not run')
          },
        },
      },
      {
        ...input,
        execution: execution('missing'),
        fault: { kind: 'foreign-tenant', reference: store.first.first.reference },
      },
    ]
    for (const invalidInput of invalidInputs) {
      expect(
        Reflect.apply(store.control.setRetainedToolInvocationFault, store.control, [invalidInput]),
      ).toEqual({ kind: 'rejected', reason: 'invalid-input' })
      expect(await observeAll(store)).toEqual(s1)
    }
    expect(store.control.setRetainedToolInvocationFault({ ...input, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(await observeAll(store)).toEqual(s0)
  })

  it.each(['request', 'fault'] as const)(
    'accepts ordinary and null prototypes but rejects a custom %s prototype with the same data',
    async level => {
      const store = await fixture()
      const s0 = await observeAll(store)
      const foreign = ok(
        toolReferences.encodeToolInvocationRef({
          ...store.first.first.parts,
          tenant: otherTenant.tenant,
        }),
      )
      const input = {
        ...store.first.selector,
        fault: { kind: 'foreign-tenant', reference: foreign },
      }
      function withPrototype(prototype: object | null) {
        const request = { ...input, fault: { ...input.fault } }
        Object.setPrototypeOf(level === 'request' ? request : request.fault, prototype)
        return request
      }
      for (const prototype of [Object.prototype, null]) {
        expect(
          Reflect.apply(store.control.setRetainedToolInvocationFault, store.control, [
            withPrototype(prototype),
          ]),
        ).toEqual({ kind: 'applied' })
        const changed = await observeAll(store)
        expect(changed[0]?.snapshot.controls[0]).toMatchObject({ toolInvocation: foreign })
        expect(store.control.setRetainedToolInvocationFault({ ...input, fault: null })).toEqual({
          kind: 'cleared',
        })
        expect(await observeAll(store)).toEqual(s0)
      }
      expect(
        store.control.setRetainedToolInvocationFault({
          ...store.first.selector,
          fault: { kind: 'malformed' },
        }),
      ).toEqual({ kind: 'applied' })
      const s1 = await observeAll(store)
      expect(
        Reflect.apply(store.control.setRetainedToolInvocationFault, store.control, [
          withPrototype({ custom: true }),
        ]),
      ).toEqual({ kind: 'rejected', reason: 'invalid-input' })
      expect(await observeAll(store)).toEqual(s1)
      expect(store.control.setRetainedToolInvocationFault({ ...input, fault: null })).toEqual({
        kind: 'cleared',
      })
      expect(await observeAll(store)).toEqual(s0)
    },
  )

  it.each(['request', 'fault'] as const)(
    'rejects an equal-key-count %s with a substituted required field before resolution',
    async level => {
      const store = await fixture()
      const s0 = await observeAll(store)
      const input = { ...store.first.selector, fault: { kind: 'malformed' } } as const
      expect(store.control.setRetainedToolInvocationFault(input)).toEqual({ kind: 'applied' })
      const s1 = await observeAll(store)
      const foreign = ok(
        toolReferences.encodeToolInvocationRef({
          ...store.first.first.parts,
          tenant: otherTenant.tenant,
        }),
      )
      const substituted =
        level === 'request'
          ? {
              execution: input.execution,
              control: input.control,
              fault: { kind: 'foreign-tenant', reference: foreign },
              unrelated: input.tenant,
            }
          : { ...input, fault: { kind: 'foreign-tenant', unrelated: foreign } }
      expect(Reflect.ownKeys(substituted)).toHaveLength(Reflect.ownKeys(input).length)
      if (level === 'fault') expect(Reflect.ownKeys(substituted.fault)).toHaveLength(2)
      const resolve = vi.spyOn(toolReferences, 'resolveToolInvocationRef')
      try {
        expect(
          Reflect.apply(store.control.setRetainedToolInvocationFault, store.control, [substituted]),
        ).toEqual({ kind: 'rejected', reason: 'invalid-input' })
        expect(resolve).not.toHaveBeenCalled()
      } finally {
        resolve.mockRestore()
      }
      expect(await observeAll(store)).toEqual(s1)
      expect(store.control.setRetainedToolInvocationFault({ ...input, fault: null })).toEqual({
        kind: 'cleared',
      })
      expect(await observeAll(store)).toEqual(s0)
    },
  )

  it('selects the accepted C in exactly one owned execution and hides unavailable targets', async () => {
    const store = await fixture()
    const s0 = await observeAll(store)
    const target = store.second.second
    expect(
      store.control.setRetainedToolInvocationFault({ ...target, fault: { kind: 'malformed' } }),
    ).toEqual({ kind: 'applied' })
    const expected = s0.map(item => ({
      ...item,
      snapshot: {
        ...item.snapshot,
        controls: item.snapshot.controls.map(record =>
          item.snapshot.execution === target.execution && record.operation === target.control
            ? { ...record, toolInvocation: 'memory-journal:malformed-retained-tool-invocation' }
            : record,
        ),
      },
    }))
    expect(await observeAll(store)).toEqual(expected)
    for (const selector of [
      { ...target, execution: execution('missing') },
      { ...target, control: operation('missing') },
      { ...target, control: operation('R') },
      { ...target, tenant: otherTenant.tenant },
      { ...target, tenant: otherTenant.tenant, control: operation('suspend') },
    ]) {
      expect(store.control.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
        kind: 'rejected',
        reason: 'target-unavailable',
      })
      expect(await observeAll(store)).toEqual(expected)
    }
    expect(
      store.control.setRetainedToolInvocationFault({
        ...target,
        control: operation('suspend'),
        fault: null,
      }),
    ).toEqual({ kind: 'rejected', reason: 'not-tool-control' })
    expect(await observeAll(store)).toEqual(expected)
    expect(store.control.setRetainedToolInvocationFault({ ...target, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(await observeAll(store)).toEqual(s0)
  })

  it('keeps the first exact bytes across repeated faults and clears only the selected field', async () => {
    const store = await fixture('spaced', true)
    const s0 = await observeAll(store)
    const selector = store.first.selector
    const foreign = ` \n${ok(toolReferences.encodeToolInvocationRef({ ...store.first.first.parts, tenant: otherTenant.tenant }))} `
    for (const fault of [
      { kind: 'malformed' },
      { kind: 'malformed' },
      { kind: 'foreign-tenant', reference: foreign },
      { kind: 'foreign-tenant', reference: foreign },
    ]) {
      expect(
        Reflect.apply(store.control.setRetainedToolInvocationFault, store.control, [
          { ...selector, fault },
        ]),
      ).toEqual({ kind: 'applied' })
    }
    expect((await load(store.journal, selector.execution)).controls[0]?.toolInvocation).toBe(
      foreign,
    )
    expect(
      store.control.setRetainedToolInvocationFault({
        ...store.second.selector,
        fault: { kind: 'malformed' },
      }),
    ).toEqual({ kind: 'applied' })
    const otherFault = (await observeAll(store))[1]
    // A later normal write must survive clear; the baseline owns only the invocation field.
    ok(
      await store.journal.recordControl({
        ...store.first.recording,
        operation: operation('other-stage'),
        target: store.first.second.control,
      }),
    )
    const beforeClear = await observeAll(store)
    expect(store.control.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    const expected = beforeClear.map(item => ({
      ...item,
      snapshot: {
        ...item.snapshot,
        controls: item.snapshot.controls.map(record =>
          item.snapshot.execution === selector.execution && record.operation === selector.control
            ? { ...record, toolInvocation: store.first.first.raw }
            : record,
        ),
      },
    }))
    expect(await observeAll(store)).toEqual(expected)
    expect((await observeAll(store))[1]).toEqual(otherFault)
    expect(store.control.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(await observeAll(store)).toEqual(expected)
    expect(s0[0]?.snapshot.controls[0]?.toolInvocation).toBe(store.first.first.raw)
    expect(store.first.first.raw).not.toBe(store.first.first.reference)
  })

  it('keeps baselines separate across instances with identical selector IDs', async () => {
    const a = await fixture('A')
    const b = await fixture('B')
    const a0 = await observeAll(a)
    const b0 = await observeAll(b)
    expect(
      a.control.setRetainedToolInvocationFault({
        ...a.first.selector,
        fault: { kind: 'malformed' },
      }),
    ).toEqual({ kind: 'applied' })
    expect(await observeAll(b)).toEqual(b0)
    expect(
      b.control.setRetainedToolInvocationFault({
        ...b.first.selector,
        fault: { kind: 'malformed' },
      }),
    ).toEqual({ kind: 'applied' })
    expect(a.control.setRetainedToolInvocationFault({ ...a.first.selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(await observeAll(a)).toEqual(a0)
    expect(b.control.setRetainedToolInvocationFault({ ...b.first.selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(await observeAll(b)).toEqual(b0)
  })

  it('preserves queued failures and pending original input through fault and clear', async () => {
    const store = await fixture()
    const { control, journal, first } = store
    const selector = first.selector
    control.failNext('recordControl', { kind: 'unavailable' })
    control.failNextRead('load')
    expect(
      control.setRetainedToolInvocationFault({ ...selector, fault: { kind: 'malformed' } }),
    ).toEqual({ kind: 'applied' })
    expect(control.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(failure(await journal.load({ ...access, execution: selector.execution }))).toMatchObject(
      { kind: 'unavailable' },
    )
    expect(
      failure(await journal.recordControl({ ...first.recording, operation: operation('new-R') })),
    ).toMatchObject({ kind: 'unavailable' })
    expect(ok(await journal.query({ ...first.recording, operation: operation('new-R') }))).toEqual({
      kind: 'unknown',
    })
    const reference = ok(
      toolReferences.encodeToolOperationRef({
        ...first.first.parts,
        operation: ok(toolReferences.decodeToolOperationId('stop')),
      }),
    )
    control.respond('message', 'fail')
    expect(
      control.setRetainedToolInvocationFault({ ...selector, fault: { kind: 'malformed' } }),
    ).toEqual({ kind: 'applied' })
    expect(control.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    const beforeJoint = await observeAll(store)
    expect(
      failure(
        await journal.commit(
          commitAt(await load(journal, selector.execution), first.opened.authority, 'joint', {
            caller: {
              kind: 'message',
              message: acceptedInput('joint-message').content,
              source: evidence('joint-source'),
              admission: evidence('joint-admission'),
            },
          }),
        ),
      ),
    ).toMatchObject({ kind: 'unavailable' })
    expect(control.joint()).toEqual([])
    expect(await observeAll(store)).toEqual(beforeJoint)
    const pending = {
      ...first.recording,
      operation: operation('pending-R'),
      toolOperation: reference,
    }
    control.failNext('recordControl', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await journal.recordControl(pending))).toEqual({
      kind: 'commit-unknown',
      operation: pending.operation,
    })
    const held = await observeAll(store)
    expect(
      control.setRetainedToolInvocationFault({ ...selector, fault: { kind: 'malformed' } }),
    ).toEqual({ kind: 'applied' })
    pending.toolOperation = ok(
      toolReferences.encodeToolOperationRef({
        ...first.first.parts,
        operation: ok(toolReferences.decodeToolOperationId('replacement')),
      }),
    )
    expect(control.setRetainedToolInvocationFault({ ...selector, fault: null })).toEqual({
      kind: 'cleared',
    })
    expect(await observeAll(store)).toEqual(held)
    expect(control.settle(selector.execution, pending.operation, 'applied')).toBe(true)
    const receipt = ok(await journal.recordControl({ ...pending, toolOperation: reference }))
    expect(ok(await journal.query(pending))).toEqual({ kind: 'committed', receipt })
    expect((await load(journal, selector.execution)).controls[0]?.toolOperation).toBe(reference)
    expect(failure(await journal.recordControl(pending))).toEqual({
      kind: 'conflict',
      operation: pending.operation,
    })
    expect(control.settle(selector.execution, pending.operation, 'applied')).toBe(false)
  })
})
