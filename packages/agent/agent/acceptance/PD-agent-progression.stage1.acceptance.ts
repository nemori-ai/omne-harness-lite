// covers: PD-agent-progression S1, PD-agent-progression S2
// #518 revision 1. J-AG02 input, actual reply processing and completion. NA-M0/M3/F4/O0.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { AgentJournal, ExecutionSnapshot } from '@omne-harness/agent-contract'
import { agentModelDeliverySchema, readModelDeliveryMaterial } from '@omne-harness/agent'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { options } from '../tests/factory-support.ts'
import {
  acceptedInput,
  afterTerminalPassage,
  commitAt,
  evidence,
  execution,
  ok,
  operation,
  type Principal,
} from '../tests/journal-support.ts'
import {
  alice,
  eventsOf,
  invoke,
  loopAssembly,
  REPLY_TEXT,
  type LoopAssembly,
} from '../tests/loop-support.ts'
import { deferred, executor } from './fixtures/process.ts'

const entry = () => ({
  binding: options().binding,
  access: alice,
  execution: execution(),
  operation: operation('invoke-exec-1'),
  initial: acceptedInput('input-exec-1', 'hello exec-1'),
  grant: null,
})

async function record(name: string, value: unknown) {
  const directory = process.env['OMNE_QA_EVIDENCE_DIR']
  if (directory !== undefined) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, `${name}.json`), JSON.stringify(value, null, 2))
  }
}

async function save(name: string, value: unknown) {
  await record(name, value)
  console.info(`PASS ${name}`)
}

async function snapshot(journal: AgentJournal<Principal>) {
  return ok(await journal.load({ ...alice, execution: execution() }))
}

async function eventPage(journal: AgentJournal<Principal>) {
  const page = ok(
    await journal.output.read({ ...alice, execution: execution(), after: null, limit: 100 }),
  )
  if (page.kind !== 'page') throw new Error('Unexpected output gap')
  return page.events
}

async function savedModelDelivery(assembly: LoopAssembly, saved: ExecutionSnapshot) {
  const pending = saved.effects[0]?.pending
  const pusher = assembly.controls.pusher
  if (pending?.kind !== 'model' || pusher === null)
    throw new Error('Missing original Model call or producer pusher')
  const reference = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
  const pushed = await pusher.settled({ tenant: alice.tenant, call: reference.call })
  expect(pushed.status).toBe('saved')
  if (pushed.status !== 'saved' || pushed.delivery === null)
    throw new Error('Producer did not receive saved for the original delivery')
  const received = saved.entries?.filter(item => item.kind === 'received')
  expect(received).toHaveLength(1)
  const entry = received?.[0]
  if (entry === undefined || entry.kind !== 'received') throw new Error('Missing received entry')
  expect(entry.delivery.key).toEqual(pushed.key)
  expect(entry.consumer).toEqual(pushed.delivery.consumer)
  expect(entry.consumption).toBe(pending.consumption)
  const material = ok(
    await assembly.controls.journal.provider.materials.read({
      ...alice,
      source: entry.material,
    }),
  )
  expect(material).toMatchObject({ kind: 'facts', schema: agentModelDeliverySchema })
  const { material: _source, ...expected } = entry
  expect(readModelDeliveryMaterial(alice, material, expected)).toEqual(pushed.delivery)
  expect(saved.results).toEqual([])
  const acknowledgements = pusher.acknowledgements()
  expect(acknowledgements).toHaveLength(1)
  expect(acknowledgements[0]?.call.call).toBe(reference.call)
  expect(acknowledgements[0]?.reply).toHaveProperty('ok')
  return { entry, material, pushed, acknowledgements }
}

function originalAuthority(saved: ExecutionSnapshot) {
  if (saved.executionAttachment === null) throw new Error('No original accepted Authority')
  return saved.executionAttachment
}

it('S1 J-AG02: public invoke processes the actual complete reply and ends once', async () => {
  const assembly = await loopAssembly([execution()])
  const handle = ok(await invoke(assembly))
  const initial = await snapshot(assembly.controls.journal.port)
  const accepted = ok(
    await assembly.controls.journal.port.inputs({
      ...alice,
      execution: execution(),
      watermark: initial.inputWatermark,
    }),
  )
  expect(accepted.messages).toEqual([entry().initial.content])
  assembly.release.open()
  const events = await eventsOf(handle)
  const saved = await snapshot(assembly.controls.journal.port)
  expect(saved.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
  expect(events.filter(item => item.body.kind === 'input-taken')).toHaveLength(1)
  expect(events.filter(item => item.body.kind === 'producer')).toHaveLength(1)
  const messages = events.flatMap(item => (item.body.kind === 'message' ? [item.body] : []))
  expect(messages).toHaveLength(1)
  expect(messages[0]?.message.role).toBe('assistant')
  expect(messages[0]?.message.blocks).toEqual([
    {
      kind: 'text',
      id: 'blk_reply_0',
      visibility: { toHuman: true, toModel: true },
      text: REPLY_TEXT,
    },
  ])
  expect(events.filter(item => item.body.kind === 'ended')).toHaveLength(1)
  expect(events.at(-1)?.body.kind).toBe('ended')
  const delivery = await savedModelDelivery(assembly, saved)
  expect(saved.output.acknowledgedThrough).toBeNull()
  await save('S1-public-journey', { events, saved, delivery })
})

it.each(['I2', 'M6', 'M1', 'M4'] as const)(
  'S1 NA-E4/M0/M3/O0: SIGKILL at %s retains the original call and delivery responsibility',
  async cut => {
    const calls = { admit: 0, beginRead: 0, ack: 0 }
    let modelInspections = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          inspect(input) {
            modelInspections++
            return d.models.calls.inspect(input)
          },
          admit(input) {
            calls.admit++
            return d.models.calls.admit(input)
          },
        },
        consumption: {
          ...d.models.consumption,
          beginRead(input) {
            calls.beginRead++
            return d.models.consumption.beginRead(input)
          },
          acknowledge(input) {
            calls.ack++
            return d.models.consumption.acknowledge(input)
          },
        },
      },
    }))
    if (cut !== 'M1') assembly.release.open()
    const reached = deferred<void>()
    const suspended = deferred<void>()
    let attemptedIntent: unknown
    const first = executor(assembly.dependencies, entry(), {
      async before(call) {
        const candidate = call.args[0]
        if (
          call.path.join('.') === 'journal.commit' &&
          candidate !== null &&
          typeof candidate === 'object' &&
          'operation' in candidate &&
          typeof candidate.operation === 'string' &&
          candidate.operation.startsWith('M0/')
        ) {
          attemptedIntent = candidate
          if (cut === 'I2') {
            reached.resolve()
            await suspended.promise
          }
        }
        if (cut === 'M1' && calls.admit === 1 && call.path.join('.') === 'journal.load') {
          reached.resolve()
          await suspended.promise
        }
      },
      async after(call, result) {
        const candidate = call.args[0]
        if (
          call.path.join('.') === 'journal.commit' &&
          candidate !== null &&
          typeof candidate === 'object' &&
          'checkpoint' in candidate &&
          candidate.checkpoint !== null &&
          typeof candidate.checkpoint === 'object' &&
          'position' in candidate.checkpoint &&
          ((cut === 'M6' && candidate.checkpoint.position === 'M6') ||
            (cut === 'M4' && candidate.checkpoint.position === 'M4')) &&
          result !== null &&
          typeof result === 'object' &&
          'ok' in result
        ) {
          reached.resolve()
          await suspended.promise
        }
      },
    })
    let second: ReturnType<typeof executor> | undefined
    try {
      const driving = first.drive('accept')
      await Promise.race([
        reached.promise,
        driving.then(result => {
          throw new Error(`Executor ended before ${cut}: ${JSON.stringify(result)}`)
        }),
      ])
      expect(await first.accepted).toHaveProperty('ok')
      const before = await snapshot(assembly.controls.journal.port)
      const counts = { ...calls }
      expect(before.checkpoint.position).toBe(cut === 'M1' ? 'M6' : cut)
      expect(counts).toEqual({
        admit: cut === 'M1' || cut === 'M4' ? 1 : 0,
        beginRead: 0,
        ack: 0,
      })
      const beforeDelivery = cut === 'M4' ? await savedModelDelivery(assembly, before) : null
      if (cut !== 'M4') expect(before.entries).toEqual([])
      const preparations = assembly.controls.requests.prepare.calls.length
      expect(
        (await eventPage(assembly.controls.journal.port)).filter(e => e.body.kind === 'message'),
      ).toHaveLength(0)
      const death = await first.kill()
      expect(death).toMatchObject({ code: null, signal: 'SIGKILL' })
      expect(first.child.signalCode).toBe('SIGKILL')
      const inspectionsAtDeath = modelInspections
      suspended.resolve()
      await first.joinCalls()
      expect(modelInspections).toBe(inspectionsAtDeath)
      const afterDeath = await snapshot(assembly.controls.journal.port)
      await record(`B1-${cut}-after-death`, {
        death,
        before,
        afterDeath,
        originalCalls: first.calls,
        cancelledCalls: first.cancelledCalls,
        inspectionsAtDeath,
        inspectionsAfterJoin: modelInspections,
      })
      expect(afterDeath).toEqual(before)
      if (cut === 'I2') {
        expect(afterDeath.checkpoint.position).toBe('I2')
        expect(afterDeath.effects).toEqual([])
      }
      const cancelledPaths = first.cancelledCalls.map(call => call.path.join('.'))
      expect(cancelledPaths).toEqual(
        cut === 'I2' ? ['journal.commit'] : cut === 'M1' ? ['journal.load'] : [],
      )
      assembly.release.open()
      if (cut === 'M1') {
        const pending = before.effects[0]?.pending
        if (pending?.kind !== 'model' || assembly.controls.pusher === null)
          throw new Error('Missing admitted Model call at M1')
        const reference = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
        await assembly.controls.pusher.settled({ tenant: alice.tenant, call: reference.call })
      }
      second = executor(assembly.dependencies, entry())
      expect(second.child.pid).not.toBe(death.pid)
      expect(await second.drive('continue', originalAuthority(before))).toEqual({ ok: undefined })
      const resumedIntentCalls = second.calls.filter(call => {
        const candidate = call.args[0]
        return (
          call.path.join('.') === 'journal.commit' &&
          candidate !== null &&
          typeof candidate === 'object' &&
          'operation' in candidate &&
          typeof candidate.operation === 'string' &&
          candidate.operation.startsWith('M0/')
        )
      })
      expect(resumedIntentCalls).toHaveLength(cut === 'I2' ? 1 : 0)
      if (cut === 'I2') expect(resumedIntentCalls[0]?.args[0]).toEqual(attemptedIntent)
      const after = await snapshot(assembly.controls.journal.port)
      const events = await eventPage(assembly.controls.journal.port)
      expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      if (
        attemptedIntent === null ||
        typeof attemptedIntent !== 'object' ||
        !('effects' in attemptedIntent)
      )
        throw new Error('The original M0 intent was not captured')
      expect(after.effects).toEqual(attemptedIntent.effects)
      const afterDelivery = await savedModelDelivery(assembly, after)
      if (beforeDelivery !== null) {
        expect(afterDelivery.entry).toEqual(beforeDelivery.entry)
        expect(afterDelivery.material).toEqual(beforeDelivery.material)
        expect(afterDelivery.pushed.receipt).toEqual(beforeDelivery.pushed.receipt)
      }
      expect(calls).toEqual({ admit: 1, beginRead: 0, ack: 0 })
      expect(assembly.controls.requests.prepare.calls).toHaveLength(preparations)
      expect(events.filter(e => e.body.kind === 'input-taken')).toHaveLength(1)
      expect(events.filter(e => e.body.kind === 'producer')).toHaveLength(1)
      expect(events.filter(e => e.body.kind === 'message')).toHaveLength(1)
      expect(events.filter(e => e.body.kind === 'ended')).toHaveLength(1)
      expect(second.idle).toBe(1)
      await save(`S1-kill-${cut}`, {
        death,
        replacement: second.child.pid,
        counts,
        afterCounts: calls,
        beforeDelivery,
        afterDelivery,
        before,
        afterDeath,
        after,
        events,
        originalCalls: first.calls,
        cancelledCalls: first.cancelledCalls,
        resumedCalls: second.calls,
        raw: [...first.output, ...second.output],
      })
    } finally {
      suspended.resolve()
      await first.close()
      await second?.close()
    }
  },
)

it('S2 NA-F4-1: SIGKILL preserves registered and pending terminal observations without another terminal', async () => {
  let finishing: Parameters<AgentJournal<Principal>['tryFinish']>[0] | undefined
  let journalLoads = 0
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    journal: {
      ...d.journal,
      load(input) {
        journalLoads++
        return d.journal.load(input)
      },
      tryFinish(input) {
        finishing = input
        return Promise.resolve(
          fail({
            kind: 'unavailable',
            owner: 'acceptance-cut',
            diagnostic: 'host fixes terminal observations',
          }),
        )
      },
    },
  }))
  assembly.release.open()
  const reached = deferred<void>()
  const suspended = deferred<void>()
  let terminalReads = 0
  let terminalReady = false
  const first = executor(assembly.dependencies, entry(), {
    async before(call) {
      if (terminalReady && call.path.join('.') === 'journal.load' && ++terminalReads === 2) {
        reached.resolve()
        await suspended.promise
      }
    },
  })
  let second: ReturnType<typeof executor> | undefined
  const journal = assembly.controls.journal.port
  try {
    const stopped = await first.drive('accept')
    expect(stopped, JSON.stringify(stopped)).toMatchObject({ failure: { node: 'F3' } })
    const prepared = await snapshot(journal)
    if (prepared.state.kind !== 'settling' || finishing === undefined)
      throw new Error('The real coordinator did not fix a finish intent')
    const authority = originalAuthority(prepared)
    ok(
      await journal.commit(
        commitAt(prepared, authority, 'host-fixed-observer-adoptions', {
          checkpoint: {
            ...prepared.checkpoint,
            passages: [
              afterTerminalPassage('pending-observer'),
              afterTerminalPassage('recorded-observer'),
            ],
          },
          state: { kind: 'settling' },
        }),
      ),
    )
    // The observation plan changed the responsibility projection: the host issues the list again
    // and presents the projection the Journal maintains (SPEC "条件终结", "终结责任清单").
    const fixed = await snapshot(journal)
    ok(
      await journal.prepareFinish({
        ...finishing,
        operation: operation('host-prepare'),
        expected: fixed.revision,
        candidate: prepared.state.intent.candidate,
      }),
    )
    const issued = await snapshot(journal)
    if (issued.state.kind !== 'settling') throw new Error('The Journal lost the finish projection')
    const finish = {
      ...finishing,
      operation: operation('host-terminal'),
      expected: issued.revision,
      intent: issued.state.intent,
    }
    expect(ok(await journal.tryFinish(finish)).kind).toBe('ended')
    const ended = await snapshot(journal)
    expect(ended.terminalObservations).toHaveLength(2)
    const recorded = ended.terminalObservations[1]
    if (recorded === undefined) throw new Error('Missing terminal obligation')
    const registration = {
      ...alice,
      execution: execution(),
      operation: operation('host-observer-registration'),
      terminal: recorded.terminal,
      passage: recorded.passage,
      implementation: recorded.implementation,
      observed: evidence('host-completed-observation'),
    }
    assembly.controls.journal.failNext('recordTerminalObservation', {
      kind: 'commit-unknown',
      outcome: 'applied',
    })
    expect(await journal.recordTerminalObservation(registration)).toHaveProperty(
      'failure.kind',
      'commit-unknown',
    )
    expect(ok(await journal.query(registration)).kind).toBe('committed')
    const before = await snapshot(journal)
    terminalReady = true
    void first.drive('run')
    await reached.promise
    const death = await first.kill()
    expect(death).toMatchObject({ code: null, signal: 'SIGKILL' })
    const loadsAtDeath = journalLoads
    suspended.resolve()
    await first.joinCalls()
    expect(journalLoads).toBe(loadsAtDeath)
    const afterDeath = await snapshot(journal)
    await record('B1-F4-after-death', {
      death,
      before,
      afterDeath,
      originalCalls: first.calls,
      cancelledCalls: first.cancelledCalls,
      loadsAtDeath,
      loadsAfterJoin: journalLoads,
    })
    expect(afterDeath).toEqual(before)
    expect(first.cancelledCalls.map(call => call.path.join('.'))).toEqual(['journal.load'])
    second = executor(assembly.dependencies, entry())
    expect(second.child.pid).not.toBe(death.pid)
    expect(await second.drive('accept')).toEqual({ ok: undefined })
    const after = await snapshot(journal)
    expect(after.state).toEqual(before.state)
    expect(after.checkpoint).toEqual(before.checkpoint)
    expect(after.output).toEqual(before.output)
    expect(after.terminalObservations).toEqual(before.terminalObservations)
    expect(after.terminalObservations.map(item => item.observed)).toEqual([
      null,
      registration.observed,
    ])
    expect(second.calls.map(call => call.path.join('.'))).not.toContain('journal.tryFinish')
    expect(
      second.calls
        .filter(call => call.path[0] === 'models')
        .every(
          call =>
            !['admit', 'beginRead', 'readNext', 'acknowledge'].includes(call.path.at(-1) ?? ''),
        ),
    ).toBe(true)
    expect(second.idle).toBe(1)
    const pending = after.terminalObservations[0]
    if (pending === undefined) throw new Error('Pending observation was lost')
    ok(
      await journal.recordTerminalObservation({
        ...registration,
        operation: operation('host-observer-later'),
        terminal: pending.terminal,
        passage: pending.passage,
        implementation: pending.implementation,
        observed: evidence('host-later-completed-observation'),
      }),
    )
    const closed = await snapshot(journal)
    expect(closed.terminalObservations.every(item => item.observed !== null)).toBe(true)
    expect((await eventPage(journal)).filter(event => event.body.kind === 'ended')).toHaveLength(1)
    expect(closed.output).toEqual(before.output)
    await save('S2-kill-F4', {
      death,
      replacement: second.child.pid,
      finish,
      registration,
      before,
      afterDeath,
      after,
      closed,
      originalCalls: first.calls,
      cancelledCalls: first.cancelledCalls,
      resumedCalls: second.calls,
      raw: [...first.output, ...second.output],
    })
  } finally {
    suspended.resolve()
    await first.close()
    await second?.close()
  }
})
