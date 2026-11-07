import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import { judgeBlockIdentity, type ContentBlock } from '@omne-harness/content-block'
import type { ActionToolCall, ExecutionSnapshot, PendingCall } from '@omne-harness/agent-contract'
import {
  createAgentToolReceiver,
  createToolReceiverState,
  type AgentToolReceiver,
} from '@omne-harness/agent'
import {
  decodeDispatchId,
  decodeResultVersion,
  resolveModelInvocationRef,
} from '@omne-harness/model-contract'
import {
  resolveToolInvocationRef,
  type ToolDelivery,
  type ToolInvokeRequest,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  judgeToolInvokeRequest,
} from '@omne-harness/tool-contract/provider'
import { adoption, evidence, execution, ok } from '../journal-support.ts'
import { alice, eventually } from '../loop-support.ts'
import { controlAssembly } from './control-assembly.ts'

type Assembly = Awaited<ReturnType<typeof controlAssembly>>
type CallAccount = NonNullable<Extract<ToolDelivery<ContentBlock>, { kind: 'result' }>['account']>
export type AssociatedTool = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>

export function toolCall(callId = 'tool-call-1', name = 'read_file'): ActionToolCall {
  const identity = judgeBlockIdentity({
    id: `blk_${callId}`,
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in identity) throw new Error(identity.rejected)
  return {
    ...identity.ok,
    kind: 'tool_call',
    callId,
    name,
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
          returns: ordinaryReturnFixture(adoption('codec')),
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

type ToolRequests = NonNullable<
  Parameters<NonNullable<Parameters<typeof controlAssembly>[1]>>[0]['toolRequests']
>

/**
 * The assembly of the tool tests. `requests` replaces faces of the trusted Tool request source;
 * `null` leaves the source out of the dependencies.
 */
export async function toolAssembly(
  configuration: Parameters<typeof controlAssembly>[2] = {},
  journal: Parameters<typeof controlAssembly>[0] = {},
  requests: Partial<ToolRequests> | null = {},
) {
  const source: ToolRequests = {
    async describe() {
      return { ok: { kind: 'tool', definition: adoption('read_file') } }
    },
    async prepare(input) {
      return { ok: fixedToolRequest(input.consumer) }
    },
    ...requests,
  }
  return controlAssembly(
    journal,
    dependencies => (requests === null ? dependencies : { ...dependencies, toolRequests: source }),
    configuration,
  )
}

async function load(assembly: Assembly): Promise<ExecutionSnapshot> {
  return ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
}

/**
 * Settles the open main Model call of the execution with `parts`, under a result version of its
 * own, and pushes the result to the receiver. Waits for the call to be saved and admitted first.
 */
export async function deliverModelReply(
  assembly: Assembly,
  parts: readonly (ContentBlock | ActionToolCall)[],
  name: string,
  /** The input token count the dispatch reports as its account; none when omitted. */
  accountLexeme?: string,
) {
  let pending: PendingCall | undefined
  await eventually(async () => {
    pending = (await load(assembly)).checkpoint.calls.find(call => call.kind === 'model')
    if (pending?.kind !== 'model') return false
    const found = ok(
      await assembly.dependencies.models.calls.inspect({ ...alice, reference: pending.reference }),
    )
    return found.kind === 'found' && found.state.phase !== 'settled'
  })
  if (pending?.kind !== 'model') throw new Error('model call not saved')
  const { call } = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
  assembly.controls.models.start({
    ...alice,
    call,
    dispatch: ok(decodeDispatchId(`mdisp_${name}`)),
    firstContent: 'observed',
  })
  if (accountLexeme !== undefined) {
    // The scripted provider keeps only the dispatches a test records; this one reports an account.
    const { admission } = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
    assembly.controls.models.recordDispatch({
      ...alice,
      call,
      record: {
        dispatch: ok(decodeDispatchId(`mdisp_${name}`)),
        supplier: {
          adoption: adoption('supplier'),
          recipient: 'recipient',
          model: 'model',
          credential: { kind: 'factory' },
        },
        intent: admission,
        send: 'started',
        firstContent: 'observed',
        terminal: { kind: 'completed', reason: 'tool-suggestions' },
        account: {
          subject: { kind: 'model_call', id: call },
          usage: [{ name: 'input', state: 'known', lexeme: accountLexeme, unit: 'token' }],
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
  }
  assembly.controls.models.settle({
    ...alice,
    call,
    version: ok(decodeResultVersion(`mrver_${name}`)),
    termination: { kind: 'completed', reason: 'tool-suggestions' },
    parts: parts.map(block => ({ kind: 'sealed' as const, trims: [], block })),
    source: evidence(`model-${name}`),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  if (assembly.controls.pusher === null) throw new Error('Model pusher missing')
  await assembly.controls.pusher.settled({ ...alice, call })
}

export async function deliverToolSuggestion(
  assembly: Assembly,
  calls: readonly ActionToolCall[] = [toolCall()],
  accountLexeme?: string,
) {
  await deliverModelReply(assembly, calls, 'tools', accountLexeme)
}

/** The plain text reply of a later step. */
export function textBlock(text: string, id = 'blk_text'): ContentBlock {
  return { kind: 'text', id, visibility: { toHuman: true, toModel: true }, text } as ContentBlock
}

/** Waits until every listed Tool call is associated, and returns them in the order of the batch. */
export async function associatedTools(assembly: Assembly, count: number) {
  let found: AssociatedTool[] = []
  await eventually(async () => {
    const batch = (await load(assembly)).checkpoint.batch
    found = (batch?.actions ?? []).flatMap(action =>
      action.call?.kind === 'tool' && action.call.association === 'associated' ? [action.call] : [],
    )
    return found.length >= count
  })
  return found
}

/** A real Agent Tool receiver over the same memory Journal, resolving targets from its calls. */
export function toolReceiver(assembly: Assembly): AgentToolReceiver<string> {
  const targetOf = async (
    snapshot: ExecutionSnapshot,
    match: (pending: AssociatedTool) => boolean,
  ) => {
    const pending = [
      ...snapshot.checkpoint.calls,
      ...(snapshot.checkpoint.batch?.actions ?? []).flatMap(action =>
        action.call === null ? [] : [action.call],
      ),
    ].find(
      (call): call is AssociatedTool =>
        call.kind === 'tool' && call.association === 'associated' && match(call),
    )
    const instance = snapshot.executionAttachment?.instance
    return pending === undefined || instance === undefined
      ? null
      : { execution: execution(), instance, pending }
  }
  const made = createAgentToolReceiver<string>(
    {
      provider: assembly.controls.journal.provider,
      access: assembly.dependencies.access,
      capacity: () => ({ records: 100, bytes: 1_000_000, attachments: 100, inFlight: 8 }),
      targets: {
        async resolve(input) {
          const read = await assembly.dependencies.journal.load({
            ...input.access,
            execution: execution(),
          })
          if ('failure' in read) return read
          return {
            ok: await targetOf(
              read.ok,
              pending =>
                pending.reference === input.reference &&
                JSON.stringify(pending.position) === JSON.stringify(input.consumer),
            ),
          }
        },
        async forExecution(input) {
          const read = await assembly.dependencies.journal.load({
            ...input.access,
            execution: input.execution,
          })
          if ('failure' in read) return read
          const target = await targetOf(read.ok, () => true)
          return { ok: target === null ? [] : [target] }
        },
      },
    },
    createToolReceiverState<string>(),
  )
  return ok(made)
}

export function toolAccount(pending: AssociatedTool, lexeme = '7'): CallAccount {
  const { call } = ok(resolveToolInvocationRef(pending.reference, alice.tenant))
  return {
    subject: { kind: 'tool_execution', id: call },
    usage: [{ name: 'input', state: 'known', lexeme, unit: 'token' }],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'suite',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision: '0',
  }
}

/** The original result delivery of one associated Tool call. */
export function toolDelivery(
  pending: AssociatedTool,
  input: Readonly<{
    name: string
    content?: readonly ContentBlock[]
    terminal?: ToolTerminal
    account?: CallAccount | null
  }>,
): ToolDelivery<ContentBlock> {
  return {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference: pending.reference,
      result: ok(decodeToolResultVersion(`result-${input.name}`)),
    },
    consumer: pending.position,
    delivery: ok(decodeToolDeliveryId(`delivery-${input.name}`)),
    relation: 'original',
    terminal: input.terminal ?? { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'not-occurred', evidence: evidence(`effect-${input.name}`) },
    source: evidence(`tool-result-${input.name}`),
    value: {
      content: input.content ?? [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
    account: input.account ?? null,
  }
}

export async function pushToolResult(
  receiver: AgentToolReceiver<string>,
  delivery: ToolDelivery<ContentBlock>,
) {
  return receiver.push({ access: alice, delivery, signal: new AbortController().signal })
}
