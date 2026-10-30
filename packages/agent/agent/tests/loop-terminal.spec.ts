import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { agentEvaluator } from '@omne-harness/agent'
import { decodeResultVersion, type ModelInvocationRef } from '@omne-harness/model-contract'
import type { AgentEvaluator, AgentJournal, JournalCommit } from '@omne-harness/agent-contract'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options, registrationHandle } from './factory-support.ts'
import {
  acceptedInput,
  afterTerminalPassage,
  commitAt,
  consumption,
  evidence,
  execution,
  failure,
  ok,
  operation,
  producedResult,
  type Principal,
  withLineage,
} from './journal-support.ts'
import {
  alice,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  shown,
  type LoopAssembly,
} from './loop-support.ts'

function coordinator(
  assembly: LoopAssembly,
  idle = () => {},
  evaluator: AgentEvaluator = agentEvaluator,
) {
  return createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
    idle,
  })
}
async function load(assembly: LoopAssembly) {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
}

describe('#516 terminal exit', () => {
  it.each(['before-F1', 'before-F3'])(
    'C1: an input accepted %s invalidates the old completion',
    async cut => {
      let injected = false
      const commits: JournalCommit<Principal>[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          async commit(input) {
            commits.push(input)
            const saved = await d.journal.commit(input)
            if (
              !injected &&
              cut === 'before-F1' &&
              input.operation.startsWith('I8/') &&
              'ok' in saved
            ) {
              injected = true
              ok(
                await d.journal.submit(
                  withLineage({
                    ...alice,
                    execution: execution(),
                    operation: operation('late-input'),
                    value: acceptedInput('late', 'continue'),
                  }),
                ),
              )
            }
            return saved
          },
          async tryFinish(input) {
            if (!injected && cut === 'before-F3') {
              injected = true
              ok(
                await d.journal.submit(
                  withLineage({
                    ...alice,
                    execution: execution(),
                    operation: operation('late-input'),
                    value: acceptedInput('late', 'continue'),
                  }),
                ),
              )
            }
            return d.journal.tryFinish(input)
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      assembly.release.open()
      ok(await c.runExecution())
      const saved = await load(assembly)
      expect(saved.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      expect(
        commits
          .flatMap(item => item.events)
          .filter(event => event.kind === 'input-taken')
          .map(event => event.batch.ordered),
      ).toEqual([['input-exec-1'], ['late']])
      expect(saved.checkpoint.step).toBe('step-2')
    },
  )

  it.each(['applied', 'dropped', 'pending'] as const)(
    'C2: lost %s finish queries the original operation before any further finish',
    async outcome => {
      const calls: string[] = []
      let lost = true
      let original = ''
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          tryFinish(input) {
            calls.push(`finish:${input.operation}`)
            if (lost) {
              lost = false
              original = input.operation
              assembly.controls.journal.failNext('tryFinish', { kind: 'commit-unknown', outcome })
            }
            return d.journal.tryFinish(input)
          },
          query(input) {
            calls.push(`query:${input.operation}`)
            return d.journal.query(input)
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      assembly.release.open()
      const ran = await c.runExecution()
      if (outcome === 'pending') {
        expect(failure(ran)).toMatchObject({
          node: 'R0',
          failure: { kind: 'commit-unknown', operation: original },
        })
        assembly.controls.journal.settle(execution(), operation(original), 'applied')
        ok(await c.runExecution())
      } else ok(ran)
      expect(calls[1]).toBe(`query:${original}`)
      expect(calls.filter(item => item.startsWith('finish:'))).toEqual(
        outcome === 'dropped'
          ? [`finish:${original}`, `finish:${original}`]
          : [`finish:${original}`],
      )
      expect((await load(assembly)).state.kind).toBe('ended')
      const page = ok(
        await assembly.dependencies.journal.output.read({
          ...alice,
          execution: execution(),
          after: null,
          limit: 100,
        }),
      )
      expect(
        page.kind === 'page' && page.events.filter(event => event.body.kind === 'ended'),
      ).toHaveLength(1)
    },
  )

  it('NA-E9-1 / NA-O0-1: idle retains registration and unacknowledged events for the original reader', async () => {
    const registrations: string[] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], d => ({
      ...d,
      registration: registrationHandle(options().binding.instance, registrations),
    }))
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    const ended = await load(assembly)
    expect(ended.output.acknowledgedThrough).toBeNull()
    expect(ended.results.every(item => item.release.kind === 'confirmed')).toBe(true)
    expect(registrations).not.toContain('registration.withdraw')
    expect((await eventsOf(handle)).at(-1)?.body.kind).toBe('ended')
    expect(
      failure(
        await assembly.provider.runtime.invoke({
          ...alice,
          execution: execution(),
          operation: operation('reopen-ended'),
          initial: acceptedInput('new-in-original'),
          grant: null,
        }),
      ).kind,
    ).toBe('conflict')
    const next = ok(await invoke(assembly, 'exec-2'))
    expect((await eventsOf(next)).filter(event => event.body.kind === 'ended')).toHaveLength(1)
    expect(
      failure(
        await assembly.dependencies.journal.submit(
          withLineage({
            ...alice,
            execution: execution(),
            operation: operation('terminal-submit'),
            value: acceptedInput('too-late'),
          }),
        ),
      ).kind,
    ).toBe('terminal')
  })
  it('NA-F1-1: candidate and before-terminal evidence are fixed before the one terminal commit', async () => {
    const commits: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit(input) {
          commits.push(input)
          return d.journal.commit(input)
        },
        async tryFinish(input) {
          const fixed = commits.find(item => item.operation.startsWith('F1/'))
          const passed = commits.find(item => item.operation.startsWith('F2/'))
          expect(fixed?.state).toMatchObject({ kind: 'settling', intent: { beforeTerminal: null } })
          expect(passed?.state).toMatchObject({ kind: 'settling', intent: input.intent })
          expect(input.intent.beforeTerminal).not.toBeNull()
          const ended = ok(await d.journal.tryFinish(input))
          expect(ended.kind).toBe('ended')
          if (ended.kind !== 'ended') throw new Error('no end')
          const saved = ok(await d.journal.load(input))
          const queried = ok(await d.journal.query(input))
          expect(saved.revision).toBe(ended.receipt.revision)
          expect(queried).toEqual({ kind: 'committed', receipt: ended.receipt })
          const page = ok(await d.journal.output.read({ ...input, after: null, limit: 100 }))
          expect(page.kind === 'page' && page.events.at(-1)?.body).toMatchObject({
            kind: 'ended',
            conclusion: input.intent.conclusion,
            disposition: ended.receipt.evidence,
          })
          return succeed(ended)
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
  })

  it.each([false, true])(
    'NA-F3-3: blocked custody is retained; real transfer=%s permits a fresh candidate',
    async transferred => {
      let proposed = false
      const outcomes: string[] = []
      const debt = producedResult('owed')
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          async commit(input) {
            const committed = await d.journal.commit(input)
            if (input.operation.startsWith('I4/') && 'ok' in committed)
              ok(
                await d.journal.recordResult({
                  ...alice,
                  execution: execution(),
                  operation: operation('debt'),
                  result: debt,
                  consumption: consumption('debt'),
                  transfer: { kind: 'none' },
                  release: { kind: 'pending' },
                }),
              )
            return committed
          },
          async tryFinish(input) {
            const result = await d.journal.tryFinish(input)
            if ('ok' in result) {
              outcomes.push(result.ok.kind)
              if (result.ok.kind === 'blocked' && transferred)
                ok(
                  await d.journal.recordResult({
                    ...alice,
                    execution: execution(),
                    operation: operation('custody'),
                    result: debt,
                    consumption: consumption('debt'),
                    transfer: {
                      kind: 'custody',
                      result: debt,
                      consumption: consumption('debt'),
                      retained: evidence('real-custody'),
                    },
                    release: { kind: 'pending' },
                  }),
                )
            }
            return result
          },
        },
      }))
      const c = coordinator(assembly, () => {}, {
        ...agentEvaluator,
        next(facts) {
          // An independently authored evaluator proposes completion despite a known debt.
          // The authoritative Journal must refuse it, and the coordinator must keep that refusal.
          if (facts.checkpoint.position === 'I8' && !proposed) {
            proposed = true
            return succeed({ kind: 'try-finish', conclusion: { kind: 'complete' }, failure: null })
          }
          return agentEvaluator.next(facts)
        },
      })
      ok(await c.accept())
      assembly.release.open()
      ok(await c.runExecution())
      expect(outcomes).toEqual(transferred ? ['blocked', 'ended'] : ['blocked'])
      expect((await load(assembly)).state.kind).toBe(transferred ? 'ended' : 'waiting')
      const retained = (await load(assembly)).results.find(item => item.consumption === 'debt')
      expect(retained).toMatchObject({
        custody: transferred ? evidence('real-custody') : null,
        release: { kind: 'pending' },
      })
    },
  )

  it('NA-O0-1: terminal replay keeps received custody without Agent Model consumption', async () => {
    let modelReads = 0,
      acknowledgements = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        consumption: {
          ...d.models.consumption,
          beginRead(input) {
            modelReads++
            return d.models.consumption.beginRead(input)
          },
          acknowledge(input) {
            acknowledgements++
            return d.models.consumption.acknowledge(input)
          },
        },
      },
    }))
    const first = coordinator(assembly)
    ok(await first.accept())
    assembly.release.open()
    ok(await first.runExecution())
    const before = await load(assembly)
    expect(before.entries).toHaveLength(1)
    expect(before.results).toEqual([])
    const originalAcks = assembly.controls.pusher?.acknowledgements()
    expect(originalAcks).toHaveLength(1)
    let idle = 0
    const restored = coordinator(assembly, () => {
      idle++
    })
    ok(await restored.accept())
    ok(await restored.runExecution())
    expect((await load(assembly)).entries).toEqual(before.entries)
    expect(assembly.controls.pusher?.acknowledgements()).toEqual(originalAcks)
    expect([modelReads, acknowledgements]).toEqual([0, 0])
    expect(idle).toBe(1)
  })

  it('NA-F4-1: a nonempty terminal ledger survives coordinator loss and recalls the original observation registration', async () => {
    let finish: Parameters<AgentJournal<Principal>['tryFinish']>[0] | null = null
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        tryFinish(input) {
          finish = input
          return Promise.resolve(
            fail({ kind: 'unavailable', owner: 'test', diagnostic: 'stop before terminal' }),
          )
        },
      },
    }))
    const first = coordinator(assembly)
    ok(await first.accept())
    assembly.release.open()
    expect(failure(await first.runExecution()).node).toBe('F3')
    expect(finish).not.toBeNull()
    const pending = afterTerminalPassage('observer-pending')
    const recorded = afterTerminalPassage('observer-recorded')
    const before = await load(assembly)
    const authority = before.executionAttachment
    if (authority === null || before.state.kind !== 'settling')
      throw new Error('missing advancement')
    const journal = assembly.controls.journal.port
    ok(
      await journal.commit(
        commitAt(before, authority, 'fixed-observer-adoptions', {
          checkpoint: { ...before.checkpoint, passages: [pending, recorded] },
          state: before.state,
        }),
      ),
    )
    const fixed = await load(assembly)
    const ended = ok(
      await journal.tryFinish({
        ...alice,
        execution: execution(),
        operation: operation('terminal-with-observers'),
        authorization: { kind: 'advancement', authority },
        expected: fixed.revision,
        intent: before.state.intent,
      }),
    )
    expect(ended.kind).toBe('ended')
    const terminal = await load(assembly)
    expect(terminal.terminalObservations).toHaveLength(2)
    const item = terminal.terminalObservations[1]
    if (item === undefined) throw new Error('missing observation')
    // The host observer supplies its real completion evidence. F4 does not run the extension.
    const registration = {
      ...alice,
      execution: execution(),
      operation: operation('observer-registration'),
      terminal: item.terminal,
      passage: item.passage,
      implementation: item.implementation,
      observed: evidence('host-observed'),
    }
    assembly.controls.journal.failNext('recordTerminalObservation', {
      kind: 'commit-unknown',
      outcome: 'applied',
    })
    expect(failure(await journal.recordTerminalObservation(registration)).kind).toBe(
      'commit-unknown',
    )
    const queried = ok(await journal.query(registration))
    expect(queried.kind).toBe('committed')
    if (queried.kind !== 'committed') throw new Error('registration was not saved')
    expect(ok(await journal.recordTerminalObservation(registration))).toEqual(queried.receipt)
    let idle = 0
    const recovered = coordinator(assembly, () => {
      idle++
    })
    ok(await recovered.accept())
    ok(await recovered.runExecution())
    const retained = await load(assembly)
    expect(retained.state).toEqual(terminal.state)
    expect(retained.checkpoint).toEqual(terminal.checkpoint)
    expect(retained.terminalObservations.map(item => item.observed)).toEqual([
      null,
      registration.observed,
    ])
    expect(retained.output).toEqual(terminal.output)
    expect(assembly.controls.extensions.resolve.calls).toHaveLength(0)
    expect(idle).toBe(1)
    const stillPending = retained.terminalObservations[0]
    if (stillPending === undefined) throw new Error('lost pending responsibility')
    // The long-lived custodian can finish the remaining item after the runtime released its slot.
    ok(
      await journal.recordTerminalObservation({
        ...registration,
        operation: operation('pending-observed-later'),
        terminal: stillPending.terminal,
        passage: stillPending.passage,
        implementation: stillPending.implementation,
        observed: evidence('later-host-observation'),
      }),
    )
    expect((await load(assembly)).terminalObservations.every(item => item.observed !== null)).toBe(
      true,
    )
  })

  it.each(['query', 'load'] as const)(
    'F3 unknown with unavailable %s preserves the terminal operation and writes no wait',
    async method => {
      let first = true
      const commits: JournalCommit<Principal>[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit(input) {
            commits.push(input)
            return d.journal.commit(input)
          },
          async tryFinish(input) {
            if (first) {
              first = false
              assembly.controls.journal.failNext('tryFinish', {
                kind: 'commit-unknown',
                outcome: 'applied',
              })
            }
            const result = await d.journal.tryFinish(input)
            assembly.controls.journal.failNextRead(method)
            return result
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      assembly.release.open()
      expect(failure(await c.runExecution())).toMatchObject({
        node: 'R0',
        failure: { kind: 'unavailable', owner: 'memory-agent-journal' },
      })
      const before = await load(assembly)
      expect(before.state.kind).toBe('ended')
      expect(commits.filter(item => item.events.some(event => event.kind === 'waiting'))).toEqual(
        [],
      )
      ok(await c.runExecution())
      expect((await load(assembly)).revision).toBe(before.revision)
      expect(commits.filter(item => item.events.some(event => event.kind === 'waiting'))).toEqual(
        [],
      )
    },
  )

  it('tryFinish refuses an absent terminal passage and an intent different from the fixed candidate', async () => {
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        async tryFinish(input) {
          expect(
            failure(
              await d.journal.tryFinish({
                ...input,
                operation: operation('without-before-terminal'),
                intent: { ...input.intent, beforeTerminal: null },
              }),
            ),
          ).toMatchObject({ kind: 'invalid', field: 'intent.beforeTerminal' })
          expect(
            ok(
              await d.journal.tryFinish({
                ...input,
                operation: operation('different-fixed-intent'),
                intent: { ...input.intent, obligations: evidence('different-obligations') },
              }),
            ),
          ).toMatchObject({ kind: 'changed' })
          expect(ok(await d.journal.load(input)).state.kind).toBe('settling')
          return d.journal.tryFinish(input)
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
  })
  it('an excluded finish re-evaluates an earlier new input before minting a fresh terminal operation', async () => {
    let first = true
    const finishes: Parameters<AgentJournal<Principal>['tryFinish']>[0][] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        async tryFinish(input) {
          finishes.push(input)
          if (first) {
            first = false
            assembly.controls.journal.failNext('tryFinish', {
              kind: 'commit-unknown',
              outcome: 'dropped',
            })
            const result = await d.journal.tryFinish(input)
            ok(
              await d.journal.submit(
                withLineage({
                  ...alice,
                  execution: execution(),
                  operation: operation('input-before-excluded-query'),
                  value: acceptedInput('new-before-query'),
                }),
              ),
            )
            return result
          }
          return d.journal.tryFinish(input)
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.release.open()
    ok(await c.runExecution())
    expect(finishes).toHaveLength(2)
    expect(finishes[0]?.operation).not.toBe(finishes[1]?.operation)
    expect(finishes[0]?.intent.inputWatermark).not.toEqual(finishes[1]?.intent.inputWatermark)
    expect((await load(assembly)).checkpoint.step).toBe('step-2')
  })
  it.each(['candidate-clock', 'F1-commit'] as const)(
    'B1: a no-reply candidate invalidated at %s consumes new input in the same drive',
    async cut => {
      let injected = false
      const references: ModelInvocationRef[] = []
      const admissions: string[] = []
      const reads: ModelInvocationRef[] = []
      const acknowledgements: { call: string; operation: string }[] = []
      const assembly = await loopAssembly([execution()], d => {
        const submit = async () => {
          if (injected) return
          injected = true
          ok(
            await d.journal.submit(
              withLineage({
                ...alice,
                execution: execution(),
                operation: operation('input-during-no-reply'),
                value: acceptedInput('late', 'continue after failure'),
              }),
            ),
          )
        }
        return {
          ...d,
          clock: {
            ...d.clock,
            async now() {
              const instant = await d.clock.now()
              if (cut === 'candidate-clock') await submit()
              return instant
            },
          },
          journal: {
            ...d.journal,
            async commit(input) {
              if (cut === 'F1-commit' && input.operation.startsWith('F1/')) await submit()
              return d.journal.commit(input)
            },
          },
          models: {
            ...d.models,
            calls: {
              ...d.models.calls,
              async admit(input) {
                admissions.push(input.call)
                const admitted = await d.models.calls.admit(input)
                if ('ok' in admitted) {
                  references.push(admitted.ok.reference)
                  assembly.controls.models.settle({
                    tenant: input.tenant,
                    call: input.call,
                    version: ok(decodeResultVersion('mrver_failed')),
                    termination: {
                      kind: 'failed',
                      fault: {
                        cause: 'upstream-unavailable',
                        diagnostic: 'final failure',
                        upstreamStatus: null,
                      },
                    },
                    parts: [],
                    source: evidence(`settled/${input.call}`),
                    pageSize: 10,
                    pageTargetBytes: 65536,
                  })
                  await assembly.controls.pusher?.settled({
                    tenant: input.tenant,
                    call: input.call,
                  })
                }
                return admitted
              },
            },
            consumption: {
              ...d.models.consumption,
              beginRead(input) {
                reads.push(input.reference)
                return d.models.consumption.beginRead(input)
              },
              acknowledge(input) {
                acknowledgements.push({ call: input.call, operation: input.operation })
                return d.models.consumption.acknowledge(input)
              },
            },
          },
        }
      })
      const c = coordinator(assembly)
      ok(await c.accept())
      ok(await c.runExecution())
      const saved = await load(assembly)
      expect(saved.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      expect(saved.checkpoint.step).toBe('step-2')
      expect(saved.checkpoint.calls).toEqual([])
      const page = ok(
        await assembly.dependencies.journal.output.read({
          ...alice,
          execution: execution(),
          after: null,
          limit: 100,
        }),
      )
      if (page.kind !== 'page') throw new Error('missing event page')
      expect(
        page.events
          .filter(event => event.body.kind === 'input-taken')
          .map(event => (event.body.kind === 'input-taken' ? event.body.batch.ordered : [])),
      ).toEqual([['input-exec-1'], ['late']])
      expect(page.events.filter(event => event.body.kind === 'waiting')).toEqual([])
      expect(admissions).toHaveLength(2)
      expect(new Set(admissions).size).toBe(2)
      expect(reads).toEqual([])
      expect(acknowledgements).toEqual([])
      expect(saved.results).toEqual([])
      expect(saved.entries).toHaveLength(2)
      const producerAcks = assembly.controls.pusher?.acknowledgements()
      expect(producerAcks?.map(item => item.call.call)).toEqual(admissions)
      expect(producerAcks?.every(item => 'ok' in item.reply)).toBe(true)
      expect(references).toHaveLength(2)
    },
  )
})
