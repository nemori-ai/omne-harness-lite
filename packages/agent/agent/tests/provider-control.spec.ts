import { describe, expect, it } from 'vitest'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { evidence, execution, modelCall, ok, operation, otherTenant } from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly } from './loop-support.ts'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import { controlAssembly } from './fixtures/control-assembly.ts'
import { deliverToolSuggestion } from './fixtures/tool-call.ts'

describe('execution control acceptance', () => {
  it('retains an in-flight result after cancellation and sends none of its tool suggestions', async () => {
    const assembly = await controlAssembly()
    const handle = ok(await invoke(assembly))
    const input = { ...alice, execution: handle.execution }
    await eventually(async () => {
      const snapshot = ok(await assembly.dependencies.journal.load(input))
      return (
        snapshot.state.kind === 'waiting' &&
        snapshot.checkpoint.calls.some(call => call.kind === 'model')
      )
    })
    const before = ok(await assembly.dependencies.journal.load(input))
    expect(
      await handle.control.control({
        ...input,
        operation: operation('cancel-issued'),
        command: { kind: 'cancel', reason: evidence('cancel-issued') },
      }),
    ).toHaveProperty('ok')
    await eventually(
      async () =>
        ok(await assembly.dependencies.journal.load(input)).settlement.judgments.length > 0,
    )
    const pending = ok(await assembly.dependencies.journal.load(input))
    expect(pending.state.kind).not.toBe('ended')
    expect(pending.settlement.judgments.at(-1)?.decision.kind).toBe('unknown')
    await deliverToolSuggestion(assembly)
    await eventually(
      async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
    )
    const ended = ok(await assembly.dependencies.journal.load(input))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
    expect(ended.effects).toEqual(before.effects)
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
    const received = ended.entries?.find(
      entry => entry.kind === 'received' && entry.delivery.key.kind === 'result',
    )
    if (received?.kind !== 'received') throw new Error('original result was not retained')
    expect(
      JSON.stringify(
        ok(await assembly.dependencies.materials.read({ ...alice, source: received.material })),
      ),
    ).toContain('tool-call-1')
  })

  it('cancels before model admission through the Journal terminal commit', async () => {
    const assembly = await controlAssembly()
    const handle = ok(await invoke(assembly))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('cancel-before-model'),
      command: { kind: 'cancel' as const, reason: evidence('cancel-before-model') },
    }
    expect(await handle.control.control(input)).toHaveProperty('ok')
    await eventually(
      async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
    )
    const snapshot = ok(await assembly.dependencies.journal.load(input))
    expect(snapshot.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
    expect(snapshot.effects).toEqual([])
    expect(snapshot.settlement.route).toMatchObject({
      kind: 'cancellation',
      installation: testCancellationPolicyInstallation.record,
    })
    expect(snapshot.settlement.judgments.at(-1)?.decision.kind).toBe('allowed')
  })

  it('reads the configured cancellation installation under the original execution read qualification', async () => {
    let readable = true
    const assembly = await controlAssembly({ reader: () => readable })
    const handle = ok(await invoke(assembly))
    const input = { ...alice, execution: handle.execution }
    const journal = assembly.dependencies.journal
    expect(await journal.readCancellationInstallation?.(input)).toEqual({
      ok: testCancellationPolicyInstallation.record,
    })
    readable = false
    expect(await journal.readCancellationInstallation?.(input)).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(
      await journal.readCancellationInstallation?.({ ...otherTenant, execution: handle.execution }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('saves a cancellation once and returns the original receipt on retry', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('cancel-original'),
      command: { kind: 'cancel' as const, reason: evidence('cancel-reason') },
    }
    const first = await handle.control.control(input)
    expect(first).toHaveProperty('ok')
    expect(await handle.control.control(input)).toEqual(first)
    const snapshot = ok(await assembly.dependencies.journal.load(input))
    expect(snapshot.controls.filter(control => control.operation === input.operation)).toHaveLength(
      1,
    )
    expect(snapshot.controls.find(control => control.operation === input.operation)).toMatchObject({
      command: input.command,
      stages: { accepted: { state: 'reached' } },
    })
    expect(
      await handle.control.control({
        ...input,
        command: { ...input.command, reason: evidence('different') },
      }),
    ).toMatchObject({
      failure: { kind: 'conflict', operation: input.operation },
    })
  })

  it('rejects another tenant before saving or propagating a command', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    expect(
      await handle.control.control({
        ...otherTenant,
        execution: handle.execution,
        operation: operation('foreign-cancel'),
        command: { kind: 'cancel', reason: evidence('foreign') },
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    const snapshot = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: handle.execution }),
    )
    expect(snapshot.controls).toEqual([])
  })

  it('keeps an unknown acceptance under its original operation', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('cancel-unknown'),
      command: { kind: 'cancel' as const, reason: evidence('cancel-reason') },
    }
    assembly.controls.journal.failNext('control', { kind: 'commit-unknown', outcome: 'applied' })
    expect(await handle.control.control(input)).toMatchObject({
      failure: { kind: 'commit-unknown', operation: input.operation },
    })
    expect(await handle.control.control(input)).toHaveProperty('ok')
    const snapshot = ok(await assembly.dependencies.journal.load(input))
    expect(snapshot.controls.filter(control => control.operation === input.operation)).toHaveLength(
      1,
    )
  })

  it('rejects a different execution passed to this handle', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    expect(
      await handle.control.control({
        ...alice,
        execution: execution('different'),
        operation: operation('different-execution'),
        command: { kind: 'cancel', reason: evidence('different') },
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'execution' } })
  })

  it('accepts only a model call recorded for the execution', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    await eventually(async () => {
      const snapshot = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: handle.execution }),
      )
      return snapshot.checkpoint.calls.some(call => call.kind === 'model')
    })
    const snapshot = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: handle.execution }),
    )
    const pending = snapshot.checkpoint.calls.find(call => call.kind === 'model')
    if (pending?.kind !== 'model') throw new Error('the model call was not saved')
    const target = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('interrupt-original'),
      command: {
        kind: 'interrupt-model' as const,
        call: target.call,
        reason: evidence('interrupt'),
      },
    }
    expect(await handle.control.control(input)).toHaveProperty('ok')
    expect(
      await handle.control.control({
        ...input,
        operation: operation('interrupt-foreign'),
        command: { ...input.command, call: modelCall('unrelated') },
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'command.call' } })
    const after = ok(await assembly.dependencies.journal.load(input))
    expect(after.controls.map(control => control.command)).toEqual([input.command])
    expect(after.executionAttachment).toEqual(snapshot.executionAttachment)
    await eventually(async () => {
      const state = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      return state.kind === 'found' && state.state.control.kind === 'requested'
    })
    const state = ok(
      await assembly.dependencies.models.calls.inspect({ ...alice, reference: pending.reference }),
    )
    expect(state).toMatchObject({
      kind: 'found',
      state: { phase: 'accepted', control: { kind: 'requested', upstream: 'unknown' } },
    })
    const controlled = ok(await assembly.dependencies.journal.load(input)).controls[0]
    expect(controlled?.stages['physically-stopped']).toBeUndefined()
    expect(controlled?.stages['qualification-revoked']).toBeUndefined()
  })
})
