import { describe, expect, it } from 'vitest'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { evidence, execution, modelCall, ok, operation, otherTenant } from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly } from './loop-support.ts'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import { controlAssembly } from './fixtures/control-assembly.ts'
import type { PendingCall } from '@omne-harness/agent-contract'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAccount,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
  type AssociatedTool,
} from './fixtures/tool-call.ts'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  resolveToolInvocationRef,
  type ToolState,
  type ToolTerminal,
} from '@omne-harness/tool-contract'

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

describe('tool call control', () => {
  type ToolAssembly = Awaited<ReturnType<typeof toolAssembly>>

  function reference(name: string) {
    return ok(
      encodeToolInvocationRef({
        tenant: alice.tenant,
        call: ok(decodeToolCallId(`tcall_${name}`)),
        admission: ok(decodeToolOperationId(`top_${name}`)),
      }),
    )
  }

  function acceptEach(assembly: ToolAssembly) {
    let count = 0
    assembly.controls.tools.invoke.always(async () => {
      count += 1
      // Agent never reads the receipt state as the current state of the call.
      return {
        kind: 'accepted',
        reference: reference(`call-${count}`),
        state: {} as ToolState,
        recovered: false,
      }
    })
  }

  function toolOperation(pending: AssociatedTool, name: string) {
    const parts = ok(resolveToolInvocationRef(pending.reference, alice.tenant))
    return ok(
      encodeToolOperationRef({ ...parts, operation: ok(decodeToolOperationId(`top_${name}`)) }),
    )
  }

  function interrupted(name: string): ToolTerminal {
    return {
      kind: 'interrupted',
      cause: {
        kind: 'control',
        operation: ok(decodeToolOperationId(`top_${name}`)),
        withdrawn: false,
      },
    }
  }

  function acceptedStop(operationRef: ReturnType<typeof toolOperation>, name: string) {
    return {
      kind: 'committed' as const,
      operation: operationRef,
      receipt: {
        operation: ok(decodeToolOperationId(`top_${name}`)),
        state: {} as ToolState,
        progress: { kind: 'accepted' as const, evidence: evidence(`${name}-accepted`) },
      },
    }
  }

  async function twoCalls(assembly: ToolAssembly) {
    acceptEach(assembly)
    const handle = ok(await invoke(assembly))
    await deliverToolSuggestion(assembly, [toolCall('call-a'), toolCall('call-b')])
    const [first, second] = await associatedTools(assembly, 2)
    if (first === undefined || second === undefined) throw new Error('calls not associated')
    return { handle, first, second }
  }

  it('interrupts only the named Tool call while the other call and the run go on', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 2 })
    const { handle, first, second } = await twoCalls(assembly)
    assembly.controls.tools.commands.control.always(() =>
      acceptedStop(toolOperation(first, 'stop-a'), 'stop-a'),
    )
    const input = { ...alice, execution: handle.execution }
    const before = ok(await assembly.dependencies.journal.load(input))
    const { call } = ok(resolveToolInvocationRef(first.reference, alice.tenant))
    expect(
      await handle.control.control({
        ...input,
        operation: operation('interrupt-a'),
        command: { kind: 'interrupt-tool', call, reason: evidence('interrupt-a') },
      }),
    ).toHaveProperty('ok')
    expect(assembly.controls.tools.commands.control.calls).toEqual([
      expect.objectContaining({ reference: first.reference, intent: { kind: 'stop' } }),
    ])
    const controlled = ok(await assembly.dependencies.journal.load(input))
    const record = controlled.controls.find(item => item.operation === operation('interrupt-a'))
    expect(record).toMatchObject({
      toolInvocation: first.reference,
      toolOperation: toolOperation(first, 'stop-a'),
      stages: { 'producer-confirmed': { state: 'reached' } },
    })
    // Acceptance by the producer is not a physical stop, and the execution keeps advancing.
    expect(record?.stages['physically-stopped']).toBeUndefined()
    expect(record?.stages['qualification-revoked']).toBeUndefined()
    expect(controlled.executionAttachment).toEqual(before.executionAttachment)
    expect(controlled.state.kind).not.toBe('ended')

    const receiver = toolReceiver(assembly)
    ok(
      await pushToolResult(
        receiver,
        toolDelivery(second, { name: 'b', content: [textBlock('result b', 'blk_b')] }),
      ),
    )
    ok(
      await pushToolResult(
        receiver,
        toolDelivery(first, {
          name: 'a',
          terminal: interrupted('stop-a'),
          content: [textBlock('partial a', 'blk_a')],
          account: toolAccount(first, '5'),
        }),
      ),
    )
    // Both slots are kept and the same run sends its next model request.
    await eventually(async () =>
      ok(await assembly.dependencies.journal.load(input)).checkpoint.calls.some(
        pending => pending.kind === 'model' && pending.action.startsWith('step-2/'),
      ),
    )
    const after = ok(await assembly.dependencies.journal.load(input))
    const kept = after.entries?.find(
      entry =>
        entry.kind === 'received' &&
        entry.delivery.producer === 'tool' &&
        entry.delivery.key.reference === first.reference,
    )
    if (kept?.kind !== 'received') throw new Error('interrupted result not received')
    expect(kept.delivery).toMatchObject({ account: { usage: [{ lexeme: '5' }] } })
    const material = ok(
      await assembly.dependencies.materials.read({ ...alice, source: kept.material }),
    )
    expect(JSON.stringify(material)).toContain('partial a')
    expect(assembly.controls.tools.commands.control.calls).toHaveLength(1)
  })

  it('queries a Tool control with an unknown answer and never sends it again', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 2 })
    const { handle, first } = await twoCalls(assembly)
    assembly.controls.tools.commands.control.always(() => ({
      kind: 'commit-unknown',
      operation: toolOperation(first, 'stop-unknown'),
    }))
    assembly.controls.tools.queries.queryOperation.always(() => ({
      ok: { kind: 'committed', revision: '2', receipt: evidence('stop-committed') } as never,
    }))
    const { call } = ok(resolveToolInvocationRef(first.reference, alice.tenant))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('interrupt-unknown'),
      command: { kind: 'interrupt-tool' as const, call, reason: evidence('interrupt-unknown') },
    }
    ok(await handle.control.control(input))
    const unknown = ok(await assembly.dependencies.journal.load(input)).controls.find(
      item => item.operation === input.operation,
    )
    expect(unknown).toMatchObject({
      toolOperation: toolOperation(first, 'stop-unknown'),
      stages: { 'producer-confirmed': { state: 'unresolved' } },
    })
    // The same control again reconciles the original Tool operation instead of a new attempt.
    ok(await handle.control.control(input))
    expect(assembly.controls.tools.commands.control.calls).toHaveLength(1)
    expect(assembly.controls.tools.queries.queryOperation.calls).toEqual([
      expect.objectContaining({ operation: toolOperation(first, 'stop-unknown') }),
    ])
    const known = ok(await assembly.dependencies.journal.load(input)).controls.find(
      item => item.operation === input.operation,
    )
    expect(known?.stages['producer-confirmed']?.state).toBe('reached')
  })

  it('keeps a Tool control whose reference was lost unresolved, without guessing or resending', async () => {
    let dropReference = true
    const assembly = await toolAssembly({ toolConcurrency: 2 })
    const journal = assembly.dependencies.journal
    const recordControl = journal.recordControl.bind(journal)
    journal.recordControl = async input => {
      if (input.toolOperation !== undefined && dropReference) {
        dropReference = false
        return { failure: { kind: 'unavailable', owner: 'agentJournal', diagnostic: 'lost' } }
      }
      return recordControl(input)
    }
    const { handle, first } = await twoCalls(assembly)
    assembly.controls.tools.commands.control.always(() => ({
      kind: 'commit-unknown',
      operation: toolOperation(first, 'stop-lost'),
    }))
    const { call } = ok(resolveToolInvocationRef(first.reference, alice.tenant))
    const input = {
      ...alice,
      execution: handle.execution,
      operation: operation('interrupt-lost'),
      command: { kind: 'interrupt-tool' as const, call, reason: evidence('interrupt-lost') },
    }
    ok(await handle.control.control(input))
    ok(await handle.control.control(input))
    const record = ok(await journal.load(input)).controls.find(
      item => item.operation === input.operation,
    )
    expect(record).toMatchObject({
      toolOperation: null,
      stages: { 'producer-confirmed': { state: 'unresolved' } },
    })
    expect(assembly.controls.tools.commands.control.calls).toHaveLength(1)
    expect(assembly.controls.tools.queries.queryOperation.calls).toHaveLength(0)
  })

  it('cancels with a per-call interrupt for each foreground Tool call and keeps late results', async () => {
    const assembly = await toolAssembly({ toolConcurrency: 2 })
    const { handle, first, second } = await twoCalls(assembly)
    assembly.controls.tools.commands.control.always(input =>
      acceptedStop(
        toolOperation(input.reference === first.reference ? first : second, 'stop'),
        'stop',
      ),
    )
    const input = { ...alice, execution: handle.execution }
    ok(
      await handle.control.control({
        ...input,
        operation: operation('cancel-tools'),
        command: { kind: 'cancel', reason: evidence('cancel-tools') },
      }),
    )
    await eventually(async () => assembly.controls.tools.commands.control.calls.length === 2)
    expect(
      assembly.controls.tools.commands.control.calls.map(item => item.reference).sort(),
    ).toEqual([first.reference, second.reference].sort())
    const receiver = toolReceiver(assembly)
    for (const [pending, name] of [
      [first, 'a'],
      [second, 'b'],
    ] as const)
      ok(
        await pushToolResult(
          receiver,
          toolDelivery(pending, {
            name,
            terminal: interrupted('stop'),
            account: toolAccount(pending, '3'),
          }),
        ),
      )
    await eventually(
      async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
    )
    const ended = ok(await assembly.dependencies.journal.load(input))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
    // No new Tool action and no next model request after the cancellation.
    expect(assembly.controls.tools.invoke.calls).toHaveLength(2)
    expect(ended.effects.some(effect => effect.pending.action.startsWith('step-2/'))).toBe(false)
    const accounts = (ended.entries ?? []).flatMap(entry =>
      entry.kind === 'received' && entry.delivery.producer === 'tool'
        ? [entry.delivery.account]
        : [],
    )
    expect(accounts).toHaveLength(2)
    for (const account of accounts)
      expect(account).toMatchObject({ usage: [{ state: 'known', lexeme: '3' }] })
  })

  it('sends no Tool invoke once a cancellation lands after the intent is saved', async () => {
    let cancel: (() => Promise<unknown>) | null = null
    const assembly = await toolAssembly()
    const journal = assembly.dependencies.journal
    const commit = journal.commit.bind(journal)
    journal.commit = async input => {
      const committed = await commit(input)
      const fire = cancel
      if (
        'ok' in committed &&
        fire !== null &&
        input.effects.some(effect => effect.pending.kind === 'tool')
      ) {
        cancel = null
        await fire()
      }
      return committed
    }
    acceptEach(assembly)
    const handle = ok(await invoke(assembly))
    const input = { ...alice, execution: handle.execution }
    cancel = () =>
      handle.control.control({
        ...input,
        operation: operation('cancel-at-intent'),
        command: { kind: 'cancel', reason: evidence('cancel-at-intent') },
      })
    await deliverToolSuggestion(assembly)
    await eventually(async () => ok(await journal.load(input)).settlement.candidate !== null)
    const read = ok(await journal.load(input))
    expect(read.checkpoint.calls).toEqual([
      expect.objectContaining({ kind: 'tool', association: 'intent' }),
    ])
    expect(assembly.controls.tools.invoke.calls).toHaveLength(0)
  })
})

describe('content and account read back after control', () => {
  type Assembly = Awaited<ReturnType<typeof controlAssembly>>

  async function modelPending(
    assembly: Assembly,
    input: {
      principal: string
      tenant: typeof alice.tenant
      execution: ReturnType<typeof execution>
    },
  ) {
    let pending: PendingCall | undefined
    await eventually(async () => {
      pending = ok(await assembly.dependencies.journal.load(input)).checkpoint.calls.find(
        call => call.kind === 'model',
      )
      if (pending?.kind !== 'model') return false
      const found = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      return found.kind === 'found'
    })
    if (pending?.kind !== 'model') throw new Error('model call not saved')
    return pending
  }

  /** The received Model result of the execution, with its material read through Materials. */
  async function receivedModel(
    assembly: Assembly,
    input: {
      principal: string
      tenant: typeof alice.tenant
      execution: ReturnType<typeof execution>
    },
  ) {
    const snapshot = ok(await assembly.dependencies.journal.load(input))
    const received = snapshot.entries?.find(
      entry =>
        entry.kind === 'received' &&
        entry.delivery.producer === 'model' &&
        entry.delivery.key.kind === 'result',
    )
    if (received?.kind !== 'received' || received.delivery.producer !== 'model')
      throw new Error('the Model result was not retained')
    if (!('accounts' in received.delivery)) throw new Error('a result carries its accounts')
    const material = ok(
      await assembly.dependencies.materials.read({ ...alice, source: received.material }),
    )
    return { snapshot, accounts: received.delivery.accounts, material: JSON.stringify(material) }
  }

  it('keeps the delivered content and account of an interrupted Model call readable', async () => {
    const assembly = await controlAssembly()
    const handle = ok(await invoke(assembly))
    const input = { ...alice, execution: handle.execution }
    const pending = await modelPending(assembly, input)
    const { call } = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
    ok(
      await handle.control.control({
        ...input,
        operation: operation('interrupt-delivered'),
        command: { kind: 'interrupt-model', call, reason: evidence('interrupt-delivered') },
      }),
    )
    await deliverModelReply(
      assembly,
      [textBlock('delivered before the stop', 'blk_kept')],
      'kept',
      '17',
    )
    await eventually(async () =>
      (ok(await assembly.dependencies.journal.load(input)).entries ?? []).some(
        entry => entry.kind === 'received' && entry.delivery.producer === 'model',
      ),
    )
    const { accounts, material } = await receivedModel(assembly, input)
    expect(material).toContain('delivered before the stop')
    expect(accounts).toEqual([
      expect.objectContaining({
        dispatch: 'mdisp_kept',
        account: expect.objectContaining({ usage: [expect.objectContaining({ lexeme: '17' })] }),
      }),
    ])
    const controlled = ok(await assembly.dependencies.journal.load(input)).controls.find(
      item => item.operation === operation('interrupt-delivered'),
    )
    // The interrupt did not end the execution or revoke its advance.
    expect(controlled?.stages['qualification-revoked']).toBeUndefined()
  })

  it('keeps the existing content and account readable after the run is cancelled', async () => {
    const assembly = await toolAssembly()
    assembly.controls.tools.invoke.always(async () => ({
      kind: 'accepted',
      reference: ok(
        encodeToolInvocationRef({
          tenant: alice.tenant,
          call: ok(decodeToolCallId('tcall_held')),
          admission: ok(decodeToolOperationId('top_held')),
        }),
      ),
      state: {} as ToolState,
      recovered: false,
    }))
    const handle = ok(await invoke(assembly))
    const input = { ...alice, execution: handle.execution }
    // The run holds a Tool call open, so the cancellation lands on a live execution.
    await deliverToolSuggestion(assembly, [toolCall()], '23')
    const [held] = await associatedTools(assembly, 1)
    if (held === undefined) throw new Error('no associated Tool call')
    const before = await receivedModel(assembly, input)
    ok(
      await handle.control.control({
        ...input,
        operation: operation('cancel-after-content'),
        command: { kind: 'cancel', reason: evidence('cancel-after-content') },
      }),
    )
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(held, { name: 'held' })))
    await eventually(
      async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
    )
    const after = await receivedModel(assembly, input)
    expect(after.snapshot.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
    expect(after.material).toContain('tool-call-1')
    expect(after.accounts).toEqual(before.accounts)
    expect(after.accounts).toEqual([
      expect.objectContaining({
        dispatch: 'mdisp_tools',
        account: expect.objectContaining({ usage: [expect.objectContaining({ lexeme: '23' })] }),
      }),
    ])
  })
})
