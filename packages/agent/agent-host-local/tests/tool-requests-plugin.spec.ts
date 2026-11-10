// `createAgentHostLocalPlugin({ toolRequests })` on real Cordis 4.0.4 (agent-host-local SPEC
// 「Tool 请求来源的插件入口」, R2-D36): the trusted Tool request source given to the plugin factory
// reaches the dependencies of every runtime the host builds, so a Tool action that the Model
// suggests is described, prepared and invoked through it. Without it the same action is not
// invoked. The Model, Journal, action admission and Tool runtime are the non-durable doubles of
// `@omne-harness/agent/testing`; the Tool request is a fixed value. Nothing here proves a real
// Tool runtime or a real source of Tool requests.
import { agentEvaluator } from '@omne-harness/agent'
import { testAdoption } from '@omne-harness/agent/testing'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AcceptedInput,
  type AgentExecutionId,
  type ExecutionSnapshot,
  type RuntimeConditions,
  type SelectedModel,
} from '@omne-harness/agent-contract'
import {
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
} from '@omne-harness/agent-contract/testing'
import { judgeBlockIdentity, type ContentBlock } from '@omne-harness/content-block'
import { judgeMessage } from '@omne-harness/message'
import {
  decodeDispatchId,
  decodeProviderName,
  decodeResultVersion,
  resolveModelInvocationRef,
} from '@omne-harness/model-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolInvokeRequest,
  type ToolState,
} from '@omne-harness/tool-contract'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentHostLocalPlugin } from '../src/cordis.ts'
import { caller, definitions, ok, openWorld, slotOf, turns, type World } from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

const evidence = (record: string) => ({
  owner: 'host-test',
  record,
  revision: '1',
  digest: `test:${record}`,
})
const adoption = (name: string) => ({
  owner: 'host-test',
  name,
  revision: '1',
  digest: `test:${name}`,
})
const EXECUTION: AgentExecutionId = ok(decodeAgentExecutionId('tool-request-execution'))

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'evaluate-completion', basis: evidence('progression') },
  model: adoption('model'),
  context: evidence('context'),
  bindings: [],
}

const selected = {
  // A Model request accepts only an adoption whose digest is 64 hex digits, as testAdoption mints.
  recipient: { route: 'route-1', profile: testAdoption('profile') },
  resolution: { kind: 'resolved', selectable: true },
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
} as unknown as SelectedModel

function input(): AcceptedInput {
  const judged = judgeMessage({
    id: `msg_${'d'.repeat(24)}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'go' },
    ],
  })
  if (!('ok' in judged)) throw new Error('fixture message refused')
  return {
    id: ok(decodeInputId('tool-request-input')),
    content: judged.ok,
    source: null,
    priority: 'ordinary',
  }
}

function toolCall(): ContentBlock {
  const identity = judgeBlockIdentity({
    id: 'blk_tool_call_1',
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in identity) throw new Error(identity.rejected)
  return {
    ...identity.ok,
    kind: 'tool_call',
    callId: 'tool-call-1',
    name: 'read_file',
    arguments: { kind: 'object', entries: [] },
  } as unknown as ContentBlock
}

function fixedRequest(consumer: ToolInvokeRequest['consumer']): ToolInvokeRequest {
  const judged = judgeToolInvokeRequest({
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
  } as never)
  return ok(judged as never)
}

/** A Tool request source that counts each face and answers a fixed request. */
function countingSource() {
  const seen = { describe: 0, prepare: 0 }
  const source = {
    async describe() {
      seen.describe += 1
      return { ok: { kind: 'tool' as const, definition: adoption('read_file') } }
    },
    async prepare(request: { consumer: ToolInvokeRequest['consumer'] }) {
      seen.prepare += 1
      return { ok: fixedRequest(request.consumer) }
    },
  }
  return { seen, source }
}

/**
 * The Tool runtime accepts the invoke with a new Tool call. Agent keeps the receipt as an original
 * fact and never reads it as the current state, so the test does not build a full ToolState.
 */
function accepted(): ToolInvokeOutcome {
  const reference = ok(
    encodeToolInvocationRef({
      tenant: caller('a').tenant,
      call: ok(decodeToolCallId('tcall_tool_request')),
      admission: ok(decodeToolOperationId('top_tool_request')),
    }),
  )
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

async function until(probe: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await probe())) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/** A host that runs EXECUTION to the point where its Model suggests one Tool call, and delivers it. */
async function suggestTool(plugin: ReturnType<typeof createAgentHostLocalPlugin>) {
  const host = await openWorld({
    stages: true,
    plugin,
    dependencies: {
      journal: {
        cancellation: {
          installation: testCancellationPolicyInstallation,
          policy: createTestCancellationPolicy(),
        },
      },
      receivingPrincipal: caller('a').principal,
    },
  })
  opened.push(host)
  host.controls.adoptions.define(definitions.first, {
    definition: { category: 'AgentDefinition', name: 'tool', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  host.controls.conditions.define(EXECUTION, conditions)
  host.controls.selection.select.always(() => ({ ok: selected }))
  host.controls.tools.invoke.always(() => accepted())
  const { instance } = ok(await host.provision.acquire(slotOf('a')))
  const runtime = ok(await host.directory.resolve({ ...caller('a'), instance }))
  ok(
    await runtime.invoke({
      ...caller('a'),
      execution: EXECUTION,
      operation: ok(decodeAgentOperationId('tool-request-invoke')),
      initial: input(),
      grant: null,
    }),
  )
  const load = async (): Promise<ExecutionSnapshot> =>
    ok(await host.controls.journal.port.load({ ...caller('a'), execution: EXECUTION }))
  let pending: ExecutionSnapshot['checkpoint']['calls'][number] | undefined
  await until(async () => {
    pending = (await load()).checkpoint.calls.find(call => call.kind === 'model')
    return pending !== undefined
  })
  if (pending?.kind !== 'model') throw new Error('no Model call is open')
  const { call, admission } = ok(resolveModelInvocationRef(pending.reference, caller('a').tenant))
  const dispatch = ok(decodeDispatchId('mdisp_tool_request'))
  host.controls.models.start({ ...caller('a'), call, dispatch, firstContent: 'observed' })
  host.controls.models.recordDispatch({
    ...caller('a'),
    call,
    record: {
      dispatch,
      supplier: {
        adoption: adoption('supplier'),
        provider: ok(decodeProviderName('recipient')),
        model: 'model',
        credential: { layer: 'official' },
      },
      intent: admission,
      send: 'started',
      firstContent: 'observed',
      terminal: { kind: 'completed', reason: 'tool-suggestions' },
      account: {
        subject: { kind: 'model_call', id: call },
        usage: [{ name: 'input', state: 'known', lexeme: '17', unit: 'token' }],
        cost: [],
        trimmed: { state: 'unknown', unit: 'token' },
        place: 'suite',
        duration: { state: 'unknown' },
        receipt: 'received',
        revision: '0',
      },
      materialization: null,
    },
  })
  host.controls.models.settle({
    ...caller('a'),
    call,
    version: ok(decodeResultVersion('mrver_tool_request')),
    termination: { kind: 'completed', reason: 'tool-suggestions' },
    parts: [{ kind: 'sealed', trims: [], block: toolCall() }],
    source: evidence('model-tool-request'),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  if (host.controls.pusher === null) throw new Error('the Model pusher is missing')
  await host.controls.pusher.settled({ ...caller('a'), call })
  return host
}

describe('createAgentHostLocalPlugin with a Tool request source', () => {
  it('describes, prepares and invokes a Tool action through the source it was given', async () => {
    const { seen, source } = countingSource()
    const host = await suggestTool(createAgentHostLocalPlugin({ toolRequests: source }))
    await until(() => host.controls.tools.invoke.calls.length > 0, 3_000)
    await turns()
    expect(seen).toEqual({ describe: 1, prepare: 1 })
    expect(host.controls.tools.invoke.calls).toHaveLength(1)
    expect(host.controls.tools.invoke.calls[0]?.request.arguments).toEqual({
      original: '{}',
      effective: '{}',
      complete: true,
    })
  })

  it('does not invoke the Tool action when no source was given', async () => {
    const host = await suggestTool(createAgentHostLocalPlugin())
    await turns(100)
    expect(host.controls.tools.invoke.calls).toHaveLength(0)
  })
})
