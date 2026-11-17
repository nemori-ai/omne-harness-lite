import { expect, it } from 'vitest'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import {
  acceptedInput,
  evidence,
  execution,
  loadWithEntries,
  ok,
  operation,
} from './journal-support.ts'
import { alice } from './loop-support.ts'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { resumeEntry } from './loop-takeover-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

it.each(['known', 'applied', 'dropped'] as const)(
  'commits tool-result processing once after a %s outcome before the next request',
  async outcome => {
    const assembly = await toolAssembly(
      { jointCommits: ['processed'] },
      { participants: ['processed'] },
    )
    let injected = false
    const ports = {
      ...assembly.dependencies,
      journal: {
        ...assembly.dependencies.journal,
        commit(input: Parameters<typeof assembly.dependencies.journal.commit>[0]) {
          if (
            !injected &&
            outcome !== 'known' &&
            input.caller.kind === 'processed' &&
            input.caller.result.producer.kind === 'tool'
          ) {
            injected = true
            assembly.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome })
          }
          return assembly.dependencies.journal.commit(input)
        },
      },
    }
    const coordinator = createExecutionCoordinator({
      ...resumeEntry(ports, { jointCommits: ['processed'], toolConcurrency: 1 }),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello'),
      grant: null,
    })
    const call = ok(decodeToolCallId('tcall_processing'))
    const reference = ok(
      encodeToolInvocationRef({
        tenant: alice.tenant,
        call,
        admission: ok(decodeToolOperationId('top_processing')),
      }),
    )
    const revision = ok(decodeToolRevision('revision-1'))
    assembly.controls.tools.invoke.always(async () => ({
      kind: 'accepted',
      reference,
      recovered: false,
      state: {
        call,
        revision,
        source: evidence('tool-state'),
        phase: 'accepted',
        relation: 'foreground',
        wait: { kind: 'none' },
        foreground: null,
        execution: { kind: 'not-started' },
        effect: { kind: 'not-started' },
        timing: { kind: 'paused', accumulatedMs: '0' },
        queue: { kind: 'none' },
        controls: [],
        delivery: null,
        supplements: [],
      },
    }))
    ok(await coordinator.accept())
    ok(await coordinator.runExecution())
    await deliverToolSuggestion(assembly)
    ok(await coordinator.runExecution())
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error('missing Tool call')
    const delivery = toolDelivery(pending, {
      name: 'one',
      content: [textBlock('file contents', 'blk_file')],
    })
    ok(await pushToolResult(toolReceiver(assembly), delivery))
    const advanced = await coordinator.runExecution()
    if (outcome === 'known') ok(advanced)
    else {
      expect(advanced).toHaveProperty('failure.failure.kind', 'commit-unknown')
      ok(await coordinator.runExecution())
    }
    const read = await loadWithEntries(assembly.dependencies, { ...alice, execution: execution() })
    expect(
      read.checkpoint.calls.some(
        call => call.kind === 'model' && call.action.startsWith('step-2/'),
      ),
    ).toBe(true)
    const processed = assembly.controls.journal
      .joint()
      .filter(
        record =>
          record.caller.kind === 'processed' && record.caller.result.producer.kind === 'tool',
      )
    expect(processed).toHaveLength(1)
    expect(processed[0]).toMatchObject({ caller: { consumption: pending.consumption } })
    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')
    ok(await coordinator.runExecution())
    expect(
      (await loadWithEntries(assembly.dependencies, { ...alice, execution: execution() })).state
        .kind,
    ).toBe('ended')
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
  },
)
