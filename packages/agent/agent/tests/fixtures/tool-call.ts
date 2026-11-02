import { judgeBlockIdentity } from '@omne-harness/content-block'
import type { Action } from '@omne-harness/agent-contract'
import { decodeDispatchId, decodeResultVersion } from '@omne-harness/model-contract'
import type { ToolInvokeRequest } from '@omne-harness/tool-contract'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
import { adoption, evidence, execution, ok } from '../journal-support.ts'
import { alice, eventually } from '../loop-support.ts'
import { controlAssembly } from './control-assembly.ts'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'

export function toolCall(): Action['original'] {
  const identity = judgeBlockIdentity({
    id: 'blk_tool_call',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in identity) throw new Error(identity.rejected)
  return {
    ...identity.ok,
    kind: 'tool_call',
    callId: 'tool-call-1',
    name: 'read_file',
    arguments: { kind: 'object', entries: [] },
  }
}

export function fixedToolRequest(consumer: ToolInvokeRequest['consumer']): ToolInvokeRequest {
  return ok(
    judgeToolInvokeRequest({
      availability: {
        kind: 'available',
        executor: adoption('executor'),
        layer: { kind: 'official' },
        definition: {
          adoption: adoption('read_file'),
          name: 'read_file',
          description: 'Read a file.',
          requiredCapabilities: [],
          backgroundAllowed: false,
          declarations: {
            adoption: adoption('tool-declarations'),
            environment: null,
            attachments: [],
            inputModalities: [],
            outputModalities: [],
            settings: null,
          },
          kind: 'function',
          parameters: {
            schema: { kind: 'object', entries: [] },
            vocabulary: adoption('json-schema'),
            descriptions: [],
          },
          returns: { kind: 'ordinary', program: { kind: 'none' } },
        },
      },
      command: null,
      arguments: { original: '{}', effective: '{}', complete: true },
      settings: adoption('settings'),
      context: adoption('context'),
      workspace: null,
      environment: null,
      requesterScope: { ref: 'tool-scope' },
      resources: [],
      scope: { owner: 'test-scope', key: 'one', grant: evidence('scope-grant') },
      consumer,
      batchDecision: null,
      mode: 'foreground',
      limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
    }),
  )
}

export async function toolAssembly() {
  return controlAssembly({}, dependencies => ({
    ...dependencies,
    toolRequests: {
      async describe() {
        return { ok: adoption('read_file') }
      },
      async prepare(input) {
        return { ok: fixedToolRequest(input.consumer) }
      },
    },
  }))
}

export async function deliverToolSuggestion(assembly: Awaited<ReturnType<typeof controlAssembly>>) {
  await eventually(async () =>
    ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    ).checkpoint.calls.some(call => call.kind === 'model'),
  )
  const pending = ok(
    await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
  ).checkpoint.calls.find(call => call.kind === 'model')
  if (pending?.kind !== 'model') throw new Error('model call not saved')
  await eventually(
    async () =>
      ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      ).kind === 'found',
  )
  const { call } = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
  assembly.controls.models.start({
    ...alice,
    call,
    dispatch: ok(decodeDispatchId('mdisp_tools')),
    firstContent: 'observed',
  })
  assembly.controls.models.settle({
    ...alice,
    call,
    version: ok(decodeResultVersion('mrver_tools')),
    termination: { kind: 'completed', reason: 'tool-suggestions' },
    parts: [{ kind: 'sealed', trims: [], block: toolCall() }],
    source: evidence('model-tool-suggestion'),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  if (assembly.controls.pusher === null) throw new Error('Model pusher missing')
  await assembly.controls.pusher.settled({ ...alice, call })
}
