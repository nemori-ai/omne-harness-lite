import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import { agentEvaluator, type AgentMeasureEvent } from '@omne-harness/agent'
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
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceProvisionKey,
  agentInstancesKey,
  agentPublicationAuthorityKey,
  type AgentInstanceProvisionService,
  type AgentInstancesService,
} from '@omne-harness/agent-cordis-contract/cordis'
import { agentHostPlugin } from '@omne-harness/agent-host-local/cordis'
import {
  decodeDispatchId,
  decodeProviderName,
  decodeResultVersion,
  resolveModelInvocationRef,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolInvokeRequest,
  type ToolState,
} from '@omne-harness/tool-contract'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
import type { Plugin } from '@deepseek-ai/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'
import {
  agentHostRow,
  createAgentHostRow,
  type AgentToolRequests,
} from '../../../src/rows/agent-host/index.ts'
import { agentInstancesRow } from '../../../src/rows/agent-instances/index.ts'
import type { RowId } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'
import { disabledTelemetryRow } from '../telemetry/support.ts'
import {
  INJECTS,
  caller,
  definition,
  hostConfig,
  hostDoubles,
  principalObject,
  scope,
  type HostDoubles,
  type Inject,
} from './doubles.ts'

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

type Started = Readonly<{ tree: LoadedTree; doubles: HostDoubles }>

async function start(options: {
  omit: Inject | null
  config?: unknown
  directory?: boolean
  row?: Plugin
}): Promise<Started> {
  const base = makeBase()
  release.push(() => base.release())
  const complete = options.omit === null
  const doubles = hostDoubles(options.omit)
  const tree = await loadTree({
    base,
    rows: [
      disabledTelemetryRow(),
      doubles.spec,
      declared(options.row ?? agentHostRow, options.config ?? hostConfig),
      ...(options.directory === true ? [declared(agentInstancesRow)] : []),
    ],
    entryObjects: options.omit === 'agentHostPrincipal' ? [] : [principalObject()],
    readinessTimeoutMs: complete && options.config === undefined ? 10_000 : 1500,
  })
  release.push(() => tree.dispose())
  return { tree, doubles }
}

type Schema = { '~standard': { validate(value: unknown): { issues?: unknown } } }
function acceptedBy(schema: unknown, value: unknown): boolean {
  expect(schema).toBeDefined()
  return (schema as Schema)['~standard'].validate(value).issues === undefined
}
const accepts = (value: unknown) => acceptedBy(agentHostRow.Config, value)

function ok<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(`expected success, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

async function until(probe: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const end = Date.now() + ms
  while (!(await probe())) {
    if (Date.now() > end) throw new Error('the condition never held')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function turns(count = 20): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

describe('the agent-host row: declaration and configuration', () => {
  it('is the real row and equals the table row of the assembly page, in the business phase', () => {
    const declaration = rowDeclarationOf(agentHostRow)
    expect(declaration).toEqual({
      row: 'agent-host',
      implementation: 'real',
      manifest: {
        provides: [
          'agentPublicationAuthority',
          'agentExecutionRecovery',
          'agentExecutionControl',
          'agentInstanceProvision',
        ],
        injects: [...INJECTS, 'telemetry'],
        phase: 'business',
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'body', phase: 'business' },
    })
    const table = serveProfile().stubManifests.get('agent-host' as RowId)
    expect(declaration?.manifest).toEqual(table)
    const withInputs = createAgentHostRow({ measure: () => {} })
    expect(rowDeclarationOf(withInputs)).toEqual(declaration)
  })

  it('accepts the factory configuration with `instanceIdleMs` and `jointCommits` that list `message`', () => {
    expect(accepts(hostConfig)).toBe(true)
    expect(accepts({ ...hostConfig, jointCommits: ['message', 'custody'] })).toBe(true)
  })

  it('refuses a missing configuration, an unknown field, a zero idle time and a repeated kind', () => {
    expect(accepts(undefined)).toBe(false)
    expect(accepts({ ...hostConfig, tenant: 'org' })).toBe(false)
    expect(accepts({ ...hostConfig, instanceIdleMs: 0 })).toBe(false)
    expect(accepts({ ...hostConfig, jointCommits: ['message', 'message'] })).toBe(false)
  })

  it('accepts the optional step limit `maxRunSteps` and refuses a zero one (R2-D221)', () => {
    expect(accepts({ ...hostConfig, maxRunSteps: 50 })).toBe(true)
    expect(accepts({ ...hostConfig, maxRunSteps: 0 })).toBe(false)
  })

  it('refuses `jointCommits` without `message`, which the member schema alone accepts (R2-D93)', () => {
    for (const jointCommits of [[], ['custody', 'processed']]) {
      const value = { ...hostConfig, jointCommits }
      expect(acceptedBy(agentHostPlugin.Config, value), JSON.stringify(jointCommits)).toBe(true)
      expect(accepts(value), JSON.stringify(jointCommits)).toBe(false)
    }
  })
})

describe('the agent-host row: on test stand-ins of its sixteen injects', () => {
  it('is ACTIVE and provides the faces of the page', { timeout: 60_000 }, async () => {
    const { tree } = await start({ omit: null })
    expect(tree.allActive).toBe(true)
    expect(tree.state('agent-host')).toMatchObject({ state: 'ACTIVE', missing: [] })
    for (const key of [
      agentPublicationAuthorityKey,
      agentExecutionRecoveryKey,
      agentExecutionControlKey,
      agentInstanceProvisionKey,
    ])
      expect(tree.service(key), key).toBeDefined()
  })

  it.each(INJECTS)(
    'without `%s` stays PENDING and names exactly that key',
    { timeout: 60_000 },
    async key => {
      const { tree } = await start({ omit: key })
      expect(tree.state('agent-host')).toMatchObject({ state: 'PENDING', missing: [key] })
      expect(tree.service(agentInstanceProvisionKey)).toBeUndefined()
      expect(tree.service(agentPublicationAuthorityKey)).toBeUndefined()
    },
  )

  it('acquires an instance through the provision face', { timeout: 60_000 }, async () => {
    const { tree } = await start({ omit: null, directory: true })
    const provision =
      tree.service<AgentInstanceProvisionService<string>>(agentInstanceProvisionKey)!
    const acquired = await provision.acquire({ ...caller, scope, definition })
    expect(acquired).toMatchObject({ ok: { instance: expect.any(String) } })
  })

  it('fails the row on a configuration the plugin refuses', { timeout: 60_000 }, async () => {
    const { tree } = await start({ omit: null, config: { ...hostConfig, instanceIdleMs: 0 } })
    expect(tree.state('agent-host').state).toBe('FAILED')
    expect(tree.service(agentInstanceProvisionKey)).toBeUndefined()
  })

  it('fails the row on `jointCommits` without `message`', { timeout: 60_000 }, async () => {
    const { tree } = await start({ omit: null, config: { ...hostConfig, jointCommits: [] } })
    expect(tree.state('agent-host').state).toBe('FAILED')
    expect(tree.service(agentInstanceProvisionKey)).toBeUndefined()
  })

  it(
    'registers a business-phase handle whose stop is settled with no instance',
    { timeout: 60_000 },
    async () => {
      const { tree } = await start({ omit: null })
      const report = await tree.shutdown()
      const outcome = report.outcomes.find(entry => entry.row === 'agent-host')
      expect(outcome?.phase).toBe('business')
      expect(outcome?.result).toEqual({ kind: 'settled' })
    },
  )
})

const evidence = (record: string) => ({
  owner: 'row-test',
  record,
  revision: '1',
  digest: `test:${record}`,
})
const adoption = (name: string) => ({
  owner: 'row-test',
  name,
  revision: '1',
  digest: `test:${name}`,
})

const conditions: RuntimeConditions = {
  source: evidence('conditions'),
  configuration: adoption('configuration'),
  progression: { kind: 'evaluate-completion', basis: evidence('progression') },
  model: adoption('model'),
  context: evidence('context'),
  bindings: [],
}

const selected = {
  recipient: { route: 'route-1', profile: testAdoption('profile') },
  resolution: { kind: 'resolved', selectable: true },
  parameters: [],
  tools: evidence('tools'),
  evidence: evidence('selected'),
} as unknown as SelectedModel

function acceptedInput(): AcceptedInput {
  return {
    id: ok(decodeInputId('row-input')),
    content: {
      id: `msg_${'d'.repeat(24)}`,
      role: 'user',
      blocks: [
        { kind: 'text', id: 'blk_1', visibility: { toHuman: true, toModel: true }, text: 'go' },
      ],
    } as unknown as AcceptedInput['content'],
    source: evidence('input-source'),
    priority: 'ordinary',
  }
}

type SealedBlock = Parameters<HostDoubles['controls']['models']['settle']>[0]['parts'][number]

function toolCall(): SealedBlock {
  return {
    kind: 'sealed',
    trims: [],
    block: {
      id: 'blk_tool_call_1',
      visibility: { toHuman: true, toModel: true },
      kind: 'tool_call',
      callId: 'tool-call-1',
      name: 'read_file',
      arguments: { kind: 'object', entries: [] },
    },
  } as unknown as SealedBlock
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
    limits: { concurrency: 1, scopeBudget: null, foregroundMs: null, backgroundAfterMs: null },
  } as never)
  return ok(judged as never)
}

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
  } satisfies AgentToolRequests
  return { seen, source }
}

function acceptedInvoke(): ToolInvokeOutcome {
  const reference = ok(
    encodeToolInvocationRef({
      tenant: caller.tenant,
      call: ok(decodeToolCallId('tcall_row_test')),
      admission: ok(decodeToolOperationId('top_row_test')),
    }),
  )
  return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
}

async function invoke(row: Plugin, execution: AgentExecutionId) {
  const started = await start({ omit: null, directory: true, row })
  const { tree, doubles } = started
  const { controls } = doubles
  controls.adoptions.define(definition, {
    definition: { category: 'AgentDefinition', name: 'tool', references: [], attributes: [] },
    evaluator: agentEvaluator,
    extensions: [],
  })
  controls.conditions.define(execution, conditions)
  controls.selection.select.always(() => ({ ok: selected }))
  controls.tools.invoke.always(() => acceptedInvoke())
  const provision = tree.service<AgentInstanceProvisionService<string>>(agentInstanceProvisionKey)!
  const directory = tree.service<AgentInstancesService<string>>(agentInstancesKey)!
  const { instance } = ok(await provision.acquire({ ...caller, scope, definition }))
  const runtime = ok(await directory.resolve({ ...caller, instance }))
  const answer = await runtime.invoke({
    ...caller,
    execution,
    operation: ok(decodeAgentOperationId(`${execution}-invoke`)),
    initial: acceptedInput(),
    grant: evidence('grant'),
  })
  return { ...started, answer }
}

async function suggestTool(row: Plugin) {
  const execution = ok(decodeAgentExecutionId('row-tool-execution'))
  const started = await invoke(row, execution)
  ok(started.answer)
  const { controls } = started.doubles
  const load = async (): Promise<ExecutionSnapshot> =>
    ok(await controls.journal.port.load({ ...caller, execution }))
  let pending: ExecutionSnapshot['checkpoint']['calls'][number] | undefined
  await until(async () => {
    pending = (await load()).checkpoint.calls.find(call => call.kind === 'model')
    return pending !== undefined
  })
  if (pending?.kind !== 'model') throw new Error('no Model call is open')
  const { call, admission } = ok(resolveModelInvocationRef(pending.reference, caller.tenant))
  const dispatch = ok(decodeDispatchId('mdisp_row_test'))
  controls.models.start({ ...caller, call, dispatch, firstContent: 'observed' })
  controls.models.recordDispatch({
    ...caller,
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
  controls.models.settle({
    ...caller,
    call,
    version: ok(decodeResultVersion('mrver_row_test')),
    termination: { kind: 'completed', reason: 'tool-suggestions' },
    parts: [toolCall()],
    source: evidence('model-tool-request'),
    pageSize: 10,
    pageTargetBytes: 65536,
  })
  if (controls.pusher === null) throw new Error('the Model pusher is missing')
  await controls.pusher.settled({ ...caller, call })
  return { ...started, load }
}

describe('the agent-host row: construction inputs reach the runtimes it builds', () => {
  it(
    'hands `measure` to the runtime, so an invoke emits the acceptance segment',
    { timeout: 60_000 },
    async () => {
      const events: AgentMeasureEvent[] = []
      const execution = ok(decodeAgentExecutionId('row-measured-execution'))
      const { answer } = await invoke(
        createAgentHostRow({ measure: event => events.push(event) }),
        execution,
      )
      ok(answer)
      await turns()
      const accept = events.filter(event => event.pass === 'accept')
      expect(accept.map(event => event.phase)).toEqual(['start', 'end'])
      expect(accept.every(event => event.execution === execution)).toBe(true)
    },
  )

  it(
    'admits and invokes a Tool action through the source `toolRequestsOf` builds from the row context',
    { timeout: 60_000 },
    async () => {
      const { seen, source } = countingSource()
      const contexts: unknown[] = []
      const { doubles } = await suggestTool(
        createAgentHostRow({
          toolRequestsOf: ctx => {
            contexts.push(ctx)
            return source
          },
        }),
      )
      await until(() => doubles.controls.tools.invoke.calls.length > 0, 5_000)
      await turns()
      expect(contexts).toHaveLength(1)
      expect(seen).toEqual({ describe: 1, prepare: 1 })
      expect(doubles.controls.tools.invoke.calls).toHaveLength(1)
    },
  )

  it(
    'without a Tool request source denies the Tool action, invokes no Tool and goes on to the next Model request',
    { timeout: 60_000 },
    async () => {
      const { doubles, load } = await suggestTool(agentHostRow)
      await until(
        async () =>
          (await load()).checkpoint.calls.some(
            call => call.kind === 'model' && call.action === 'step-2/main',
          ),
        5_000,
      )
      await turns(100)
      expect(doubles.controls.tools.invoke.calls).toHaveLength(0)
    },
  )
})
