import { expect, test, vi } from 'vitest'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { createToolDeliveryJournal } from '../src/tool-driver-journal.ts'
import { createToolDelivery } from '../src/tool-delivery.ts'
import { readToolDriverHistory } from '../src/tool-driver-history.ts'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { origin, scope } from './tool-driver-history-fixture.ts'
import { officialPiece } from './tool-driver-history-fixture.ts'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import type { RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import { LOOP_EXTENSION_IMPLEMENTATIONS } from '@omne-harness-lite/loop-extension-runner/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { afterEachSubject } from '../src/tool-delivery-subject.ts'

function eachPiece(): RunnerPiece {
  const definition = judgeDefinition({
    name: 'example:result-projection',
    position: 'after_action',
    dimension: { scope: 'each' },
    power: 'rewrite',
    implementation: { kind: 'builtin', builtinName: 'example:result-projection' },
  })
  if (!('ok' in definition)) throw new Error('invalid projection fixture')
  return { definition: definition.ok, power: 'rewrite' }
}
function messagePiece(): RunnerPiece {
  const definition = judgeDefinition({
    name: 'example:message-review',
    position: 'before_persist_message',
    power: 'rewrite',
    implementation: { kind: 'builtin', builtinName: 'example:message-review' },
  })
  if (!('ok' in definition)) throw new Error('invalid message review fixture')
  return { definition: definition.ok, power: 'rewrite' }
}

async function ended(f: Awaited<ReturnType<typeof actionIntegrationFixture>>) {
  const actions = await f.dispatch()
  if (actions.kind !== 'complete') throw new Error(JSON.stringify(actions))
  const runtime = f.current.assembly.ctx.toolRuntimeRegistry
  const submitted = await runtime.submit({
    access: f.current.toolAccess,
    scope,
    origin,
    adoption: f.f.adoption,
    call: f.f.calls[0]!,
    admissionToken: actions.admissions[0]!.token,
  })
  if (submitted.kind !== 'recorded') throw new Error(JSON.stringify(submitted))
  const acquired = await runtime.acquire(f.current.toolAccess, submitted.execution)
  if (acquired.kind !== 'acquired') throw new Error(JSON.stringify(acquired))
  try {
    expect(await acquired.observer.waitForEnd()).toMatchObject({
      kind: 'found',
      snapshot: { state: { phase: 'ended', terminal: { outcome: 'completed' } } },
    })
  } finally {
    acquired.observer.release()
  }
  return submitted.execution.callId
}
async function delivery(
  f: Awaited<ReturnType<typeof actionIntegrationFixture>>,
  maintenance = false,
) {
  const journal = await createToolDeliveryJournal({
    owner: f.current.owner.operations,
    recovery: f.current.owner.recovery,
    scope,
  })
  if (journal.kind !== 'journal') throw new Error(JSON.stringify(journal))
  return createToolDelivery({
    journal,
    recovery: f.current.owner.recovery,
    results: f.current.assembly.ctx.toolResults,
    runner: () => (maintenance ? f.current.maintenanceRunner : f.current.runner),
    attempts: 3,
  })
}

test('actual A/B/C delivery appends the ToolMessage and confirmation together, and repeated delivery never repeats execution or message', async () => {
  const executor = vi.fn(async () => 'real tool result')
  const f = await actionIntegrationFixture({ executor })
  let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
  try {
    const call = await ended(f)
    const before = await f.f.prefix()
    const initial = projectToolJournal(scope, before.entries)
    if ('invalid' in initial) throw new Error('invalid initial journal')
    expect(initial.executions.get(call)!.confirmed).toBeUndefined()
    coordinator = await delivery(f)
    expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
    expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
    const prefix = await f.f.prefix(),
      projected = projectToolJournal(scope, prefix.entries)
    if ('invalid' in projected) throw new Error('invalid actual tool journal')
    const execution = projected.executions.get(call)!
    expect(execution.ready?.value.result.blocks).toMatchObject([
      { kind: 'text', text: 'real tool result' },
    ])
    expect(execution.confirmed?.value.message).toMatchObject({ type: 'tool', callId: call })
    const common = readToolDriverHistory(prefix)
    if ('unavailable' in common) throw new Error('invalid complete common prefix')
    const message = common.models.entries.find(record => record.captured.message?.type === 'tool')!
    const confirmation = prefix.entries.findIndex(
      entry => entry.dedupeKey === execution.confirmed!.key,
    )
    expect(prefix.entries[confirmation - 1]!.dedupeKey).toBe(message.entry.dedupeKey)
    const writes = f.current.append.mock.calls.filter(([, entries]) =>
      entries.some(entry => entry.dedupeKey === execution.confirmed!.key),
    )
    expect(writes).toHaveLength(1)
    expect(writes[0]![1].map(entry => entry.dedupeKey)).toEqual([
      message.entry.dedupeKey,
      execution.confirmed!.key,
    ])
    expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
    expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
    expect((await f.f.prefix()).tail).toEqual(prefix.tail)
    expect(executor).toHaveBeenCalledTimes(1)
  } finally {
    await coordinator?.close()
    await f.close()
  }
})

test('the actual after_action hook changes only the delivered projection; raw author return and terminal account remain unchanged', async () => {
  const executor = vi.fn(async () => 'original author return')
  const f = await actionIntegrationFixture({ executor, pieces: [officialPiece(), eachPiece()] })
  let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
  const invoke = vi.fn(
    async (input: import('@omne-harness-lite/loop-extension').ExtensionInput) => {
      if (
        input.position !== 'after_action' ||
        !('result' in input.subject) ||
        !input.subject.result
      )
        throw new Error('wrong actual hook input')
      return {
        kind: 'output' as const,
        value: {
          kind: 'rewrite' as const,
          subject: {
            ...input.subject,
            result: {
              ...input.subject.result,
              blocks: input.subject.result.blocks.map(block =>
                block.kind === 'text' ? { ...block, text: 'visible projection' } : block,
              ),
            },
          },
        },
      }
    },
  )
  const contribution = f.current.assembly.ctx.plugin({
    name: 'projection-fixture',
    inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
    apply(ctx: Context) {
      ctx.loopExtensionImplementations.registerBuiltin('example:result-projection', invoke)
    },
  })
  try {
    const call = await ended(f)
    const a = projectToolJournal(scope, (await f.f.prefix()).entries)
    if ('invalid' in a) throw new Error('A invalid')
    const original = a.executions.get(call)!.terminal!.value
    coordinator = await delivery(f)
    expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
    expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
    const after = projectToolJournal(scope, (await f.f.prefix()).entries)
    if ('invalid' in after) throw new Error('confirmed history invalid')
    expect(after.executions.get(call)!.terminal!.value).toEqual(original)
    expect(after.executions.get(call)!.ready!.value.result.blocks).toMatchObject([
      { text: 'visible projection' },
    ])
    expect(
      await f.current.assembly.ctx.toolResults.readResult(f.current.toolAccess, {
        ...scope,
        callId: f.f.calls[0]!.callId,
      }),
    ).toMatchObject({
      kind: 'found',
      value: { result: { content: [{ text: 'original author return' }] } },
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledTimes(1)
  } finally {
    await coordinator?.close()
    await contribution.dispose()
    await f.close()
  }
})

test.each(['A', 'B', 'C'] as const)(
  'cold restart after %s continues durable delivery without invoking the tool again',
  async cut => {
    const executor = vi.fn(async () => 'durable result')
    const f = await actionIntegrationFixture({ executor })
    let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
    try {
      const call = await ended(f)
      coordinator = await delivery(f)
      if (cut !== 'A') expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
      if (cut === 'C') expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
      await coordinator.close()
      coordinator = undefined
      await f.reopen()
      coordinator = await delivery(f)
      expect(await coordinator.recover(call)).toEqual({ kind: 'ready' })
      expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
      expect(executor).toHaveBeenCalledTimes(1)
      const common = readToolDriverHistory(await f.f.prefix())
      if ('unavailable' in common) throw new Error('invalid cold common history')
      expect(
        common.models.entries.filter(record => record.captured.message?.type === 'tool'),
      ).toHaveLength(1)
    } finally {
      await coordinator?.close()
      await f.close()
    }
  },
)

test.each(['B', 'C'] as const)(
  'a lost %s append receipt is recognized from the entire original batch without another message or execution',
  async cut => {
    const executor = vi.fn(async () => 'receipt result')
    const f = await actionIntegrationFixture({ executor })
    let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
    try {
      const call = await ended(f)
      coordinator = await delivery(f)
      if (cut === 'C') expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
      const actual = f.current.append.getMockImplementation()!
      f.current.append.mockImplementationOnce(async (...args) => {
        await actual(...args)
        return { failure: 'unavailable' }
      })
      expect(await (cut === 'B' ? coordinator.prepare(call) : coordinator.confirm(call))).toEqual({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
      expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
      expect(executor).toHaveBeenCalledTimes(1)
      const common = readToolDriverHistory(await f.f.prefix())
      if ('unavailable' in common) throw new Error('invalid receipt common history')
      expect(
        common.models.entries.filter(record => record.captured.message?.type === 'tool'),
      ).toHaveLength(1)
    } finally {
      await coordinator?.close()
      await f.close()
    }
  },
)

test.each([true, false])(
  'cold recovery uses complete durable conclusions when present (%s), and never reruns a contribution after its continuity is lost',
  async complete => {
    const executor = vi.fn(async () => 'original recovery content')
    const f = await actionIntegrationFixture({ executor, pieces: [officialPiece(), eachPiece()] })
    let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
    const invoke = vi.fn(
      async (input: import('@omne-harness-lite/loop-extension').ExtensionInput) => {
        if (!complete) return { kind: 'controlUnavailable' as const }
        if (
          input.position !== 'after_action' ||
          !('result' in input.subject) ||
          !input.subject.result
        )
          throw new Error('wrong hook input')
        return {
          kind: 'output' as const,
          value: {
            kind: 'rewrite' as const,
            subject: {
              ...input.subject,
              result: {
                ...input.subject.result,
                blocks: input.subject.result.blocks.map(block =>
                  block.kind === 'text'
                    ? { ...block, text: 'confirmed historical projection' }
                    : block,
                ),
              },
            },
          },
        }
      },
    )
    const contribution = f.current.assembly.ctx.plugin({
      name: 'cold-projection-fixture',
      inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
      apply(ctx: Context) {
        ctx.loopExtensionImplementations.registerBuiltin('example:result-projection', invoke)
      },
    })
    try {
      const call = await ended(f)
      const before = projectToolJournal(scope, (await f.f.prefix()).entries)
      if ('invalid' in before) throw new Error('A invalid')
      const execution = before.executions.get(call)!,
        subject = afterEachSubject(execution)!
      const result = await f.current.runner.dispatch(
        {
          position: 'after_action',
          dimension: { scope: 'each' },
          subject,
          manifest: scope.session,
          anchor: execution.terminal!.value.delivery.pass,
          run: origin.run,
          attempt: origin.attempt,
        },
        new AbortController().signal,
      )
      expect(result).toMatchObject(
        complete ? { effect: { kind: 'proceed' } } : { failure: 'unavailable' },
      )
      await contribution.dispose()
      // Actual old Cordis fibers/runner invocations and physical owner are drained before reopen.
      await f.reopen()
      coordinator = await delivery(f)
      expect(await coordinator.recover(call)).toEqual({ kind: 'ready' })
      expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
      const after = projectToolJournal(scope, (await f.f.prefix()).entries)
      if ('invalid' in after) throw new Error('cold delivery invalid')
      const ready = after.executions.get(call)!.ready!.value
      expect(ready.basis.kind).toBe(complete ? 'conclusions' : 'recovered_without_after_action')
      expect(ready.result.blocks).toMatchObject([
        { text: complete ? 'confirmed historical projection' : 'original recovery content' },
      ])
      expect(after.executions.get(call)!.terminal!.value).toEqual(execution.terminal!.value)
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(executor).toHaveBeenCalledTimes(1)
    } finally {
      await coordinator?.close()
      await contribution.dispose()
      await f.close()
    }
  },
)

test('before_persist_message reviews the ready projection and C records the actual final message without changing B or A', async () => {
  const f = await actionIntegrationFixture({
    executor: async () => 'before review',
    pieces: [officialPiece(), messagePiece()],
  })
  let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
  const invoke = vi.fn(
    async (input: import('@omne-harness-lite/loop-extension').ExtensionInput) => {
      if (input.position !== 'before_persist_message' || input.subject.message.type !== 'tool')
        throw new Error('wrong tool message review input')
      const message = input.subject.message
      return {
        kind: 'output' as const,
        value: {
          kind: 'rewrite' as const,
          subject: {
            ...input.subject,
            message: {
              ...message,
              blocks: [
                {
                  ...message.blocks[0],
                  blocks: message.blocks[0].blocks.map(block =>
                    block.kind === 'text' ? { ...block, text: 'reviewed message' } : block,
                  ),
                },
              ],
            },
          },
        },
      }
    },
  )
  const contribution = f.current.assembly.ctx.plugin({
    name: 'message-review-fixture',
    inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
    apply(ctx: Context) {
      ctx.loopExtensionImplementations.registerBuiltin('example:message-review', invoke)
    },
  })
  try {
    const call = await ended(f)
    coordinator = await delivery(f)
    expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
    expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
    const projected = projectToolJournal(scope, (await f.f.prefix()).entries)
    if ('invalid' in projected) throw new Error('reviewed delivery invalid')
    const execution = projected.executions.get(call)!
    expect(execution.ready!.value.result.blocks).toMatchObject([{ text: 'before review' }])
    expect(execution.confirmed!.value.message.blocks).toMatchObject([
      { blocks: [{ text: 'reviewed message' }] },
    ])
    expect(execution.terminal!.value.terminal).toEqual({
      outcome: 'completed',
      result: 'before review',
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(readToolDriverHistory(await f.f.prefix())).not.toHaveProperty('unavailable')
  } finally {
    await coordinator?.close()
    await contribution.dispose()
    await f.close()
  }
})

test.each(['A', 'B'] as const)(
  'maintenance settles a %s delivery after access revocation and attempt replacement, while business advancement stays denied',
  async cut => {
    const executor = vi.fn(async () => 'existing admitted result')
    const f = await actionIntegrationFixture({
      executor,
      pieces: [officialPiece(), messagePiece()],
    })
    let coordinator: Awaited<ReturnType<typeof delivery>> | undefined
    const review = vi.fn(async () => ({
      kind: 'output' as const,
      value: { kind: 'observed' as const },
    }))
    const contribution = f.current.assembly.ctx.plugin({
      name: 'maintenance-message-review',
      inject: [LOOP_EXTENSION_IMPLEMENTATIONS],
      apply(ctx: Context) {
        ctx.loopExtensionImplementations.registerBuiltin('example:message-review', review)
      },
    })
    try {
      const call = await ended(f)
      coordinator = await delivery(f, true)
      if (cut === 'B') expect(await coordinator.prepare(call)).toEqual({ kind: 'ready' })
      await f.f.attempt(2)
      f.current.revoke()
      expect(await f.dispatch()).not.toMatchObject({ kind: 'complete' })
      expect(
        await f.current.assembly.ctx.toolRuntimeRegistry.acquire(f.current.toolAccess, {
          ...scope,
          callId: call,
        }),
      ).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
      expect(await coordinator.recover(call)).toEqual({ kind: 'ready' })
      expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
      expect(await coordinator.confirm(call)).toEqual({ kind: 'confirmed' })
      const common = readToolDriverHistory(await f.f.prefix())
      if ('unavailable' in common) throw new Error('maintenance common history invalid')
      expect(
        common.models.entries.filter(record => record.captured.message?.type === 'tool'),
      ).toHaveLength(1)
      expect(common.runs.get(origin.run)?.latest?.value.attempt).toEqual(2)
      expect(review).toHaveBeenCalledTimes(1)
      expect(executor).toHaveBeenCalledTimes(1)
      expect(
        await f.current.maintenanceRunner.dispatch(
          {
            position: 'after_action',
            dimension: { scope: 'batch' },
            subject: { outcomes: [{ callId: call, outcome: 'completed' }] },
            manifest: scope.session,
            anchor: 'forbidden',
            run: origin.run,
            attempt: origin.attempt,
          },
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'unavailable' })
    } finally {
      await coordinator?.close()
      await contribution.dispose()
      await f.close()
    }
  },
)
