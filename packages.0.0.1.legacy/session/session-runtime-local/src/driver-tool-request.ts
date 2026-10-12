import type { AssetEvaluator } from '@omne-harness-lite/asset-evaluation'
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
    tenantIdEquals(held.binding.tenant, source.tenant)
  )
}

async function captureAfterAction(
  held: RunnerReadScope,
  request: ExecutionSubmission,
  signal: AbortSignal,
  evaluator: AssetEvaluator | undefined,
) {
  const chain =
    held.selectedChain ??
    (await readRunnerChain({
      session: request.scope.session,
      binding: held.binding,
      sources: held.sources,
      ...(evaluator ? { evaluator } : {}),
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

export type DriverToolResolution =
  { readonly selected: SelectedTool } | { readonly notExecutable: 'unparseable' | 'no_such_entry' }

export async function prepareDriverToolRequest(
  input: {
    readonly request: ExecutionSubmission
    readonly source: SourceToken
    readonly host: RunnerServiceHost
    readonly signal: AbortSignal
    readonly evaluator?: AssetEvaluator | undefined
  } & DriverToolResolution,
): Promise<PreparedToolExecution | undefined> {
  const { request, source, host, signal } = input
  if (signal.aborted) return
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
    const chain = await captureAfterAction(held, request, signal, input.evaluator)
    if (!chain) return
    const fixed = {
      access: request.access,
      ref: { ...request.scope, callId: request.call.callId },
      origin: request.origin,
      call: request.call,
      source,
      afterAction: { pass, selectedChain: chain },
      ...(request.admissionToken === undefined ? {} : { admissionToken: request.admissionToken }),
    }
    if ('notExecutable' in input)
      return { ...fixed, adoption: request.adoption, notExecutable: input.notExecutable }
    if (request.call.unparseable) return
    return { ...fixed, selected: input.selected, args: request.call.arguments }
  } finally {
    held.release()
  }
}
