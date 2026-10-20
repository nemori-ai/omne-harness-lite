// The memory Journal against the same-shape list of docs/architecture/mechanisms.md
// "两种实现必须同形的事实". Each `describe` names one fact by its number, so the suite can move to a
// durable provider unchanged. Tests read only what the port returns. The three choices that wait
// for #558 have their own `describe` at the end, named 「临时做法，待 #558 裁定」.
import { describe, expect, it } from 'vitest'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
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
    expect(failure(await finish(journal, opened, 'old-finish'))).toEqual({ kind: 'stale-advance' })
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
          beforeTerminal: null,
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
          beforeTerminal: null,
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
          beforeTerminal: null,
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
