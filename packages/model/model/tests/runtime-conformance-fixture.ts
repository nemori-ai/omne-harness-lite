import { randomUUID } from 'node:crypto'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  createScriptedTransport,
  type ConformanceAction,
  type ConformanceHooks,
  type ConformanceSubject,
} from '@omne-harness/model-contract/testing'
import type { Mutation } from '@omne-harness/model-contract'
import type { MemoryAction } from '@omne-harness/model/testing'
import { runtimeFixture, eventually } from './runtime-fixture.ts'
import { resultFacts } from './runtime-settlement-facts.ts'
import { fixture, identity, op, unbox } from './memory-fixture.ts'
import { completionRecords } from './completion-records.ts'
type Principal = ReturnType<typeof fixture>['principal']

export function runtimeConformanceSubject(
  record: (event: unknown) => void = () => {},
): ConformanceSubject<Principal> {
  let fault: Parameters<NonNullable<ConformanceHooks<Principal>['failNextWrite']>>[0] | undefined
  const completions = completionRecords()
  const f = runtimeFixture(
    {},
    commands => {
      const wrap =
        <A extends Mutation<Principal>, T>(
          method: 'admit' | 'control' | 'handoff',
          action: 'admit' | 'cancel' | 'acknowledge',
          run: (input: A) => Promise<T>,
        ) =>
        async (input: A) => {
          const selected =
            fault?.operation === input.operation &&
            fault.action === action &&
            tenantEquals(fault.tenant, input.tenant)
              ? fault
              : undefined
          if (selected) {
            fault = undefined
            f.controls.commands.injectUnknown({
              ...input,
              method,
              effect: selected.effect === 'applied' ? 'applied' : 'not-applied',
            })
          }
          const result = await run(input)
          if (selected)
            record({ hook: 'failNextWrite', method, input, effect: selected.effect, result })
          if (selected)
            f.controls.commands.reveal({
              ...input,
              result: selected.effect === 'applied' ? 'committed' : 'not-committed',
            })
          return result
        }
      return {
        ...commands,
        admit: wrap('admit', 'admit', commands.admit),
        control: wrap('control', 'cancel', commands.control),
        handoff: wrap('handoff', 'acknowledge', commands.handoff),
      }
    },
    completions.verify,
  )
  const advanceCleanup: NonNullable<
    ConformanceHooks<Principal>['advanceCleanup']
  > = async input => {
    const current = unbox(
      await f.dependencies.commands.loadRecovery({ ...input, principal: f.principal }),
    )
    if (!current.execution) throw new Error('missing cleanup execution')
    const result = unbox(
      await f.dependencies.commands.advanceCleanup({
        ...current.execution,
        operation: op(`cleanup-${randomUUID()}`),
      }),
    )
    record({ hook: 'advanceCleanup', input, result })
  }
  const transport = createScriptedTransport({
    receipt: {
      supplier: f.admit.request.suppliers[0].adoption,
      representation: f.admit.request.representation,
      payloadDigest: 'a'.repeat(64),
    },
    facts: [],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })
  let sends = 0
  const countedTransport: import('@omne-harness/model-contract').ModelTransport = {
    async prepare(request, supplier) {
      const prepared = await transport.transport.prepare(request, supplier)
      if ('failure' in prepared) return prepared
      return {
        ok: {
          close: () => prepared.ok.close(),
          async materialize(signal) {
            const materialized = await prepared.ok.materialize(signal)
            if ('failure' in materialized) return materialized
            return {
              ok: {
                ...materialized.ok,
                start(signal) {
                  const stream = materialized.ok.start(signal)
                  sends++
                  return stream
                },
              },
            }
          },
        },
      }
    },
  }
  return {
    provider: f.provider,
    principal: f.principal,
    tenant: f.tenant,
    otherTenant: identity('6'),
    request: f.admit.request,
    consumer: f.admit.consumer,
    capacity: f.admit.capacity,
    transport: {
      transport: countedTransport,
      sends: () => sends,
      request: f.admit.request,
      supplier: f.admit.request.suppliers[0],
    },
    hooks: {
      failNextWrite: async input => {
        fault = input
      },
      startRun: async input => {
        await f.start(input.call)
      },
      settleCall: async input => {
        const current = unbox(
          await f.dependencies.commands.loadRecovery({ ...input, principal: f.principal }),
        )
        if (current.state.phase === 'settled') return
        f.controls.commands.configureResultPaging({
          ...input,
          resultPageParts: input.pageSize,
          resultPageTargetBytes: input.pageTargetBytes,
        })
        record({ hook: 'settleCall', input })
        const termination =
          input.termination.kind === 'interrupted'
            ? { kind: 'interrupted' as const, stop: 'confirmed' as const }
            : input.termination
        f.channel(input.call).push([...resultFacts(input.parts), { kind: 'ended', termination }])
        await eventually(() => f.results.has(input.call))
        const outcome = f.results.get(input.call)
        if (outcome && typeof outcome === 'object' && 'failure' in outcome)
          throw new Error(`real driver refused settlement: ${JSON.stringify(outcome.failure)}`)
      },
      provideEvidence: async input => {
        const current = unbox(
          await f.dependencies.commands.loadRecovery({ ...input, principal: f.principal }),
        )
        if (current.state.phase !== 'settled') throw new Error('completion before settlement')
        const proof = completions.finish({
          ...input,
          result: current.state.settlement.version,
          consumer: current.state.consumer,
          outcome: `processed:${input.label}`,
        })
        record({
          hook: 'provideEvidence',
          input,
          consumer: current.state.consumer,
          result: current.state.settlement.version,
          proof,
        })
        return proof
      },
      advanceCleanup,
      blockCleanup: async input => {
        f.controls.commands.setCleanupFailure({ ...input, diagnostic: 'synthetic-cleanup-blocked' })
        await advanceCleanup(input)
      },
      showFacts: async input => {
        await f.show(input.call, input.facts)
      },
      disconnectObservers: async () => {
        f.controls.instances.setAvailable(false)
      },
      revokeAccess: async input => {
        const actions: Record<ConformanceAction, MemoryAction> = {
          inspect: 'facts',
          dispatches: 'account',
          cancel: 'control',
          connect: 'observe',
          observe: 'observe',
          read: 'content',
          acknowledge: 'handoff',
        }
        if (input.action === 'all')
          for (const action of Object.values(actions)) f.denied.add(action)
        else f.denied.add(actions[input.action])
        record({ hook: 'revokeAccess', input, denied: [...f.denied] })
      },
      withdrawInstance: async input => {
        const publication = f.publications.get(input.call)
        if (!publication) throw new Error('missing publication')
        unbox(await f.dependencies.instances.withdraw(publication))
      },
      replaceInstance: async input => {
        unbox(await f.replace(input.call, input.instance))
      },
      failDirectory: async () => {
        f.controls.instances.setAvailable(false)
      },
    },
    dispose: () => f.dispose(),
  }
}
