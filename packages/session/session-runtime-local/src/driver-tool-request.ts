import { createHash } from 'node:crypto'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  readRunnerChain,
  type RunnerServiceHost,
  type RunnerReadScope,
} from '@omne-harness-lite/loop-extension-runner'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type {
  ExecutionSubmission,
  PreparedToolExecution,
  SelectedTool,
} from '@omne-harness-lite/tool-execution-runtime'

function currentToolRunner(held: RunnerReadScope, source: SourceToken, signal: AbortSignal) {
  return (
    !signal.aborted &&
    held.isActive() &&
    held.binding.session === source.session &&
    tenantIdEquals(held.binding.tenant, source.tenant) &&
    held.binding.logGeneration === source.journalGeneration
  )
}

async function captureAfterAction(
  held: RunnerReadScope,
  request: ExecutionSubmission,
  signal: AbortSignal,
) {
  const chain =
    held.selectedChain ??
    (await readRunnerChain({
      session: request.scope.session,
      binding: held.binding,
      sources: held.sources,
    }))
  if (!Array.isArray(chain) || !held.isActive() || signal.aborted) return
  const copied = copyJsonValue(
    chain.filter(
      piece =>
        piece.definition.position === 'after_action' && piece.definition.dimension.scope === 'each',
    ),
  )
  if ('failed' in copied || !Array.isArray(copied.ok)) return
  return copied.ok
}

export async function prepareDriverToolRequest(input: {
  readonly request: ExecutionSubmission
  readonly selected: SelectedTool
  readonly source: SourceToken
  readonly host: RunnerServiceHost
  readonly signal: AbortSignal
}): Promise<PreparedToolExecution | undefined> {
  const { request, selected, source, host, signal } = input
  if (signal.aborted || request.call.arguments === undefined) return
  const pass = `tool-after-${createHash('sha256')
    .update(
      JSON.stringify([
        request.scope.tenant,
        request.scope.session,
        request.origin,
        request.call.callId,
      ]),
    )
    .digest('hex')}`
  const held = await host.acquireReplay(
    {
      manifest: request.scope.session,
      anchor: pass,
      run: request.origin.run,
      position: 'after_action',
      dimension: { scope: 'each' },
      subject: { callId: request.call.callId, outcome: 'completed' },
    },
    signal,
  )
  if ('failure' in held) return
  try {
    if (!currentToolRunner(held, source, signal)) return
    const chain = await captureAfterAction(held, request, signal)
    if (!chain) return
    return {
      access: request.access,
      ref: { ...request.scope, callId: request.call.callId },
      origin: request.origin,
      call: request.call,
      args: request.call.arguments,
      selected,
      source,
      afterAction: { pass, selectedChain: chain },
      ...(request.admissionToken === undefined ? {} : { admissionToken: request.admissionToken }),
    }
  } finally {
    held.release()
  }
}
