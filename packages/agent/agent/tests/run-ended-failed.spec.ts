// SPEC「以失败终结」: a run that ends with a `fail` conclusion keeps why in its conclusion cause and
// tells the `endedFailed` receiver once. A Model call that settled as failed is still a `no-reply`
// candidate (SC-AG-153), but its cause names the fault; `no-reply` stays for a call that completed
// without content.
import { describe, expect, it } from 'vitest'
import type { AgentRunEndedFailed } from '@omne-harness/agent'
import {
  decodeResultVersion,
  type ModelFault,
  type ResultPart,
  type Termination,
} from '@omne-harness/model-contract'
import { evidence, execution, ok } from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly, type LoopAssembly } from './loop-support.ts'

const input = { ...alice, execution: execution() }

/** A loop whose main call settles at once with `termination` and `parts`. */
async function endingWith(
  termination: Termination,
  parts: readonly ResultPart[],
  reports: AgentRunEndedFailed[],
): Promise<LoopAssembly> {
  const assembly: LoopAssembly = await loopAssembly(
    [execution()],
    d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(call) {
            const admitted = await d.models.calls.admit(call)
            if ('ok' in admitted) {
              assembly.controls.models.settle({
                tenant: call.tenant,
                call: call.call,
                version: ok(decodeResultVersion('mrver_final')),
                termination,
                parts,
                source: evidence('settled'),
                pageSize: 10,
                pageTargetBytes: 65536,
              })
              await assembly.controls.pusher?.settled({ tenant: call.tenant, call: call.call })
            }
            return admitted
          },
        },
      },
    }),
    undefined,
    undefined,
    { endedFailed: event => reports.push(event) },
  )
  return assembly
}

async function ended(assembly: LoopAssembly) {
  await eventually(
    async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
  )
  // Let the drive pass F4 and settle, so a second report would show.
  for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
  return ok(await assembly.dependencies.journal.load(input))
}

describe('a run that ends with a failure keeps and reports its cause', () => {
  it('a Model call failed on connect-timeout: the conclusion names the fault, one report', async () => {
    const reports: AgentRunEndedFailed[] = []
    const fault: ModelFault = {
      cause: 'upstream-unavailable',
      diagnostic: 'connect-timeout',
      upstreamStatus: null,
    }
    const assembly = await endingWith({ kind: 'failed', fault }, [], reports)
    ok(await invoke(assembly))
    const read = await ended(assembly)
    const record = `${execution()}/step-1/model-failed/upstream-unavailable/connect-timeout`
    expect(read.state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'fail', cause: { owner: '@omne-harness/agent', record } },
    })
    const candidate = read.settlement.candidate?.failure
    expect(candidate).toMatchObject({ kind: 'no-reply', step: 'step-1' })
    // The structured fault is the settlement's fault, field for field.
    if (candidate?.kind !== 'no-reply') throw new Error('no no-reply candidate')
    expect(candidate.fault).toStrictEqual(fault)
    expect(reports).toHaveLength(1)
    expect(reports[0]?.failure?.fault).toStrictEqual(fault)
    expect(reports[0]).toMatchObject({
      kind: 'run-ended-failed',
      tenant: alice.tenant,
      execution: execution(),
      cause: { record },
      failure: { kind: 'no-reply', step: 'step-1' },
    })
  })

  it('a diagnostic with a slash stays one segment of the cause record', async () => {
    const reports: AgentRunEndedFailed[] = []
    const assembly = await endingWith(
      {
        kind: 'failed',
        fault: { cause: 'upstream-protocol', diagnostic: 'http/502', upstreamStatus: '502' },
      },
      [],
      reports,
    )
    ok(await invoke(assembly))
    await ended(assembly)
    expect(reports.map(report => report.cause.record)).toEqual([
      `${execution()}/step-1/model-failed/upstream-protocol/http%2F502`,
    ])
  })

  it('negative control: a call that completed without content is still no-reply', async () => {
    const reports: AgentRunEndedFailed[] = []
    const assembly = await endingWith({ kind: 'completed', reason: 'stop' }, [], reports)
    ok(await invoke(assembly))
    const read = await ended(assembly)
    const record = `${execution()}/step-1/no-reply`
    expect(read.state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'fail', cause: { record } },
    })
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      cause: { record },
      failure: { kind: 'no-reply', fault: null },
    })
    const candidate = read.settlement.candidate?.failure
    if (candidate?.kind !== 'no-reply') throw new Error('no no-reply candidate')
    expect('fault' in candidate).toBe(false)
  })

  it('a run that completes is not reported', async () => {
    const reports: AgentRunEndedFailed[] = []
    const assembly = await loopAssembly([execution()], undefined, undefined, undefined, {
      endedFailed: event => reports.push(event),
    })
    assembly.release.open()
    ok(await invoke(assembly))
    const read = await ended(assembly)
    expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(reports).toEqual([])
  })

  it('a receiver that throws changes nothing: the run still ends with its cause', async () => {
    const thrown: AgentRunEndedFailed[] = []
    const assembly = await endingWith(
      {
        kind: 'failed',
        fault: { cause: 'stream-lost', diagnostic: 'reset', upstreamStatus: null },
      },
      [],
      new Proxy(thrown, {
        get(target, key, receiver) {
          if (key === 'push')
            return () => {
              throw new Error('receiver broke')
            }
          return Reflect.get(target, key, receiver) as unknown
        },
      }),
    )
    ok(await invoke(assembly))
    const read = await ended(assembly)
    expect(read.state).toMatchObject({
      kind: 'ended',
      conclusion: { cause: { record: `${execution()}/step-1/model-failed/stream-lost/reset` } },
    })
  })
})
