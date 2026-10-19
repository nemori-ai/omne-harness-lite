// Builders and controllable ports for the managed-runtime tests. Each builder returns a fresh
// value, so a test can change one field and keep the rest legal. Every port the logical-result
// path must not touch is a throwing stub that counts its calls.
import type { BlockId, TextContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolInstanceId,
  decodeToolOperationId,
  defaultResultPolicy,
  judgeToolState,
  type Adoption,
  type DurableEvidence,
  type FixedToolRequest,
  type ParameterContract,
  type TextResultFactory,
  type ToolCallId,
  type ToolDefinition,
  type ToolDefinitionMetadata,
  type ToolDriver,
  type ToolInstanceHost,
  type ToolInstanceId,
  type ToolMessageContentBlock,
  type ToolOperationId,
  type ToolProvider,
  type ToolResult,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  createToolLedger,
  createToolRuntime,
  type AccessVerdict,
  type GrantVerdict,
  type LedgerCommitInput,
  type ToolConfiguration,
  type ToolGrantVerifier,
  type ToolDependencies,
  type ToolLedger,
  type ToolLedgerAction,
  type ToolLedgerGuards,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from '@omne-harness/tool/testing'

export type Block = ToolMessageContentBlock
/** The principal of these tests: a subject and the tenants it belongs to. */
export type Principal = Readonly<{ subject: string; tenants: readonly string[] }>
export type TenantShape = Readonly<{
  name: 'TenantId'
  organization: Readonly<{ name: 'OrganizationId'; text: string }>
  account: Readonly<{ name: 'AccountId'; text: string }>
}>

function tenantKeyOf(tenant: TenantShape): string {
  return `${tenant.organization.text}/${tenant.account.text}`
}

/**
 * A tenant with the shape of legal-identity's TenantId. The ledger checks the shape and leaves
 * the minted proof to the access guard, which these tests replace, so no cast crosses a boundary
 * that the production guard would not re-check.
 */
export function tenant(organization: string, account: string): TenantShape {
  return {
    name: 'TenantId',
    organization: { name: 'OrganizationId', text: organization },
    account: { name: 'AccountId', text: account },
  }
}

export const tenantA = tenant('org_a', 'acc_a')
export const tenantB = tenant('org_b', 'acc_b')
export const principalA: Principal = { subject: 'alice', tenants: [tenantKeyOf(tenantA)] }
export const principalB: Principal = { subject: 'bob', tenants: [tenantKeyOf(tenantB)] }

function decoded<T>(outcome: Outcome<T, unknown>, text: string): T {
  if (!('ok' in outcome)) throw new Error(`fixture identity: ${text}`)
  return outcome.ok
}

export function callId(text: string): ToolCallId {
  return decoded(decodeToolCallId(text), text)
}

export function operationId(text: string): ToolOperationId {
  return decoded(decodeToolOperationId(text), text)
}

export function adoption(name: string): Adoption {
  return { owner: 'test-owner', name, revision: '1', digest: `sha256:${name}` }
}

export function evidence(record: string, owner = 'test-owner'): DurableEvidence {
  return { owner, record, revision: '1', digest: `sha256:${record}` }
}

export const jsonLimits = {
  maxBytes: 4_096,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

function parameters(): ParameterContract {
  return {
    schema: {
      kind: 'object',
      entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
    },
    vocabulary: adoption('json-schema'),
    descriptions: [{ path: 'path', text: 'The path value.' }],
  }
}

function metadata(name: string): ToolDefinitionMetadata {
  return {
    adoption: adoption(name),
    name,
    description: `The ${name} tool.`,
    requiredCapabilities: [],
    backgroundAllowed: false,
    declarations: {
      adoption: adoption('declarations'),
      environment: null,
      attachments: [],
      inputModalities: [],
      outputModalities: [],
      settings: null,
    },
  }
}

export function functionDefinition(
  overrides: Partial<ToolDefinitionMetadata> = {},
): ToolDefinition {
  return {
    ...metadata('read_file'),
    ...overrides,
    kind: 'function',
    parameters: parameters(),
    returns: { kind: 'ordinary', program: { kind: 'none' } },
  }
}

export function request(overrides: Partial<FixedToolRequest> = {}): FixedToolRequest {
  return {
    availability: {
      kind: 'available',
      definition: functionDefinition(),
      executor: adoption('exec'),
    },
    invocation: { kind: 'direct', source: evidence('entry') },
    command: null,
    arguments: { original: '{"path":"a.txt"}', effective: '{"path":"a.txt"}', complete: true },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: adoption('environment'),
    resources: [],
    scope: { owner: 'scope-owner', key: 'scope-1', grant: evidence('grant-1') },
    consumer: { owner: 'consumer', work: 'work-1', position: 'position-1', purpose: 'tool-result' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
    ...overrides,
  }
}

/** A request for a tool that is known to be unavailable. */
export function dummyRequest(overrides: Partial<FixedToolRequest> = {}): FixedToolRequest {
  return request({
    availability: {
      kind: 'known-unavailable',
      definition: functionDefinition(),
      reason: 'dependency-unavailable:file-system',
    },
    ...overrides,
  })
}

export function text(id: string, value: string): TextContentBlock {
  return {
    kind: 'text',
    id: id as BlockId,
    visibility: { toHuman: true, toModel: true },
    text: value,
  }
}

/** A text factory that cuts the text into blocks of `chunk` characters, one block when omitted. */
export function textFactory(chunk = Number.MAX_SAFE_INTEGER): TextResultFactory<Block> {
  return {
    text: value => {
      const blocks: Block[] = []
      for (let start = 0; start < value.length || blocks.length === 0; start += chunk)
        blocks.push(text(`logical-${blocks.length}`, value.slice(start, start + chunk)))
      const result: ToolResult<Block> = {
        content: blocks,
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      }
      return succeed(result)
    },
  }
}

/** The text of a block; a reference block has none. */
export function textOf(block: Block): string {
  return block.kind === 'text' ? block.text : ''
}

export type Spies = Readonly<{ calls: Map<string, number> }>

function stub<T extends object>(spies: Spies, name: string, methods: readonly string[]): T {
  const out: Record<string, unknown> = {}
  for (const method of methods)
    out[method] = () => {
      spies.calls.set(`${name}.${method}`, (spies.calls.get(`${name}.${method}`) ?? 0) + 1)
      throw new Error(`${name}.${method} must not be called on the logical-result path`)
    }
  // Every method of the port is a throwing stub, so the object has the port's shape at run time.
  return out as T
}

/** A grant of the fake scope guard: `owner` granted `key` to the tenant and to the caller. */
export type ScopeGrant = Readonly<{
  owner: string
  key: string
  tenant: TenantShape
  subject: string
}>

export type GuardOptions = Readonly<{
  chunk?: number
  /** Source records that the source guard reports as forged. */
  forged?: readonly string[]
  /** When set, every access question answers unavailable with this diagnostic. */
  accessUnavailable?: string
  /** Actions that the access guard denies to every principal. */
  deniedActions?: readonly ToolLedgerAction[]
  /** When set, the access guard accepts only these tenant objects, as a minted-identity check. */
  minted?: ReadonlySet<object>
  /** When set, the access guard throws an Error with this message. */
  accessThrows?: string
  /** When set, the source guard throws an Error with this message. */
  sourceThrows?: string
  /**
   * The grants the scope guard knows, by the record of the grant evidence. When omitted every
   * scope is granted; when set a scope is granted only by a matching entry.
   */
  grants?: ReadonlyMap<string, ScopeGrant>
  /**
   * The scope owners that the assembly declares a grant verifier for; only the owner of the
   * default request when omitted.
   */
  grantOwners?: readonly string[]
  /** When set, the grant source cannot be read: the scope guard answers unavailable. */
  grantUnavailable?: string
  /** When set, the scope guard throws an Error with this message. */
  grantThrows?: string
  /** The text result factory; the chunking factory when omitted. */
  results?: TextResultFactory<Block>
  /**
   * The current start qualification by call: a call in the set is refused, as when a script call
   * lost its `programmable` permission after the admission. The set may change during a test.
   */
  startRefused?: Set<string>
  /** When set, the start guard answers unavailable with this diagnostic. */
  startUnavailable?: string
}>

/** The configuration fields the harness passes on: the ledger reads two of them. */
export type HarnessOptions = GuardOptions & Partial<ToolConfiguration>

function qualify(
  options: GuardOptions,
  input: Parameters<ToolLedgerGuards<Principal, Block>['access']['qualify']>[0],
): AccessVerdict {
  if (options.accessThrows !== undefined) throw new Error(options.accessThrows)
  if (options.accessUnavailable !== undefined)
    return { kind: 'unavailable', diagnostic: options.accessUnavailable }
  if (options.minted !== undefined && !options.minted.has(input.tenant))
    return { kind: 'denied', reason: 'not-a-minted-tenant' }
  if (options.deniedActions?.includes(input.action) === true)
    return { kind: 'denied', reason: 'action-not-granted' }
  const member = input.principal.tenants.includes(tenantKeyOf(input.tenant))
  return member ? { kind: 'allowed' } : { kind: 'denied', reason: 'not-a-member' }
}

function grantVerdict(
  options: GuardOptions,
  input: Parameters<ToolGrantVerifier<Principal>['verifyGrant']>[0],
): GrantVerdict {
  if (options.grants === undefined) return { kind: 'granted' }
  const { scope } = input
  const known = options.grants.get(scope.grant.record)
  const matches =
    known !== undefined &&
    known.owner === scope.owner &&
    known.key === scope.key &&
    tenantKeyOf(known.tenant) === tenantKeyOf(input.tenant) &&
    known.subject === input.principal.subject
  return matches ? { kind: 'granted' } : { kind: 'refused', reason: 'no-grant' }
}

export function guards(options: GuardOptions = {}): ToolLedgerGuards<Principal, Block> {
  return {
    access: {
      qualify: input => new Promise(resolve => resolve(qualify(options, input))),
    },
    sources: {
      verify: input =>
        new Promise(resolve => {
          if (options.sourceThrows !== undefined) throw new Error(options.sourceThrows)
          resolve(
            (options.forged ?? []).includes(input.invocation.source.record)
              ? { kind: 'forged', reason: 'not-from-the-entry' }
              : { kind: 'trusted' },
          )
        }),
    },
    grants: new Map(
      (options.grantOwners ?? ['scope-owner']).map(owner => [
        owner,
        {
          verifyGrant: input =>
            new Promise(resolve => {
              if (options.grantThrows !== undefined) throw new Error(options.grantThrows)
              if (options.grantUnavailable !== undefined)
                resolve({ kind: 'unavailable', diagnostic: options.grantUnavailable })
              else resolve(grantVerdict(options, input))
            }),
        } satisfies ToolGrantVerifier<Principal>,
      ]),
    ),
    starts: {
      qualifyStart: input =>
        new Promise(resolve => {
          if (options.startUnavailable !== undefined)
            resolve({ kind: 'unavailable', diagnostic: options.startUnavailable })
          else if (options.startRefused?.has(input.call) === true)
            resolve({ kind: 'refused', reason: 'programmatic invocation is no longer permitted' })
          else resolve({ kind: 'allowed' })
        }),
    },
    results: options.results ?? textFactory(options.chunk),
    policy: defaultResultPolicy,
    budgets: { arguments: jsonLimits },
  }
}

export function configuration(overrides: Partial<ToolConfiguration> = {}): ToolConfiguration {
  return {
    authorBufferBytes: 4_096,
    authorBufferItems: 16,
    authorWaitHistoryBytes: 65_536,
    authorWaitHistoryItems: 8,
    processBatchBytes: 4_096,
    processBatchDelayMs: 0,
    observerBufferBytes: 65_536,
    resultPageBytes: 4_096,
    reconciliationDelayMs: 0,
    ledgerCommitAttempts: 8,
    queueCapacity: 64,
    ...overrides,
  }
}

export function configurationOf(options: HarnessOptions): ToolConfiguration {
  const defaults = configuration()
  return configuration({
    resultPageBytes: options.resultPageBytes ?? defaults.resultPageBytes,
    ledgerCommitAttempts: options.ledgerCommitAttempts ?? defaults.ledgerCommitAttempts,
    queueCapacity: options.queueCapacity ?? defaults.queueCapacity,
    ...(options.driverStepsPerRun === undefined
      ? {}
      : { driverStepsPerRun: options.driverStepsPerRun }),
    ...(options.driverRetryDelayMs === undefined
      ? {}
      : { driverRetryDelayMs: options.driverRetryDelayMs }),
  })
}

export const instanceId: ToolInstanceId = decoded(decodeToolInstanceId('instance-1'), 'instance-1')

/**
 * An instance host that keeps the installed driver and the wake-ups the runtime asked for. A
 * wake-up runs nothing by itself, as a real host may defer it; `runScheduled` runs the driver for
 * each queued call in order, with the principal of the call's tenant, until no wake-up is left.
 */
export type TestHost = ToolInstanceHost<Principal> &
  Readonly<{
    driver(): ToolDriver<Principal>
    readonly scheduled: Readonly<{ tenant: TenantShape; call: ToolCallId }>[]
    runScheduled(): Promise<number>
  }>

export function testHost(spies: Spies): TestHost {
  let installed: ToolDriver<Principal> | null = null
  const scheduled: { tenant: TenantShape; call: ToolCallId }[] = []
  const driver = (): ToolDriver<Principal> => {
    if (installed === null) throw new Error('no driver was installed')
    return installed
  }
  return {
    ...stub<Pick<ToolInstanceHost<Principal>, 'publish' | 'withdraw'>>(spies, 'instances', [
      'publish',
      'withdraw',
    ]),
    directory: stub(spies, 'directory', ['connect']),
    install: next => {
      installed = next
      return { release: () => Promise.resolve() }
    },
    schedule: input => {
      // The runtime passes the tenant it was given; these tests use TenantShape values.
      scheduled.push({ tenant: input.tenant as TenantShape, call: input.call })
      return Promise.resolve(succeed({ queued: true } as const))
    },
    driver,
    scheduled,
    runScheduled: async () => {
      let runs = 0
      for (let next = scheduled.shift(); next !== undefined; next = scheduled.shift()) {
        const principal = next.tenant === tenantB ? principalB : principalA
        await driver().run({ ...next, principal, signal: new AbortController().signal })
        runs += 1
      }
      return runs
    },
  }
}

export type Harness = Readonly<{
  store: MemoryToolLedgerStore<Block>
  ledger: ToolLedger<Principal, Block>
  provider: ToolProvider<Principal, Block>
  runtime: ToolProvider<Principal, Block>['runtime']
  spies: Spies
  host: TestHost
}>

/** A real runtime over the non-durable store; only the ledger ports are real. */
export function harness(options: HarnessOptions = {}): Harness {
  const store = createMemoryToolLedgerStore<Block>()
  const spies: Spies = { calls: new Map() }
  const clock = stub<ToolDependencies<Principal, Block, null>['clock']>(spies, 'clock', [
    'now',
    'begin',
    'elapsed',
    'waitUntil',
  ])
  const config = configurationOf(options)
  const ledger = createToolLedger(store, guards(options), clock, config)
  const host = testHost(spies)
  const dependencies: ToolDependencies<Principal, Block, null> = {
    instance: instanceId,
    commands: ledger.commands,
    admissions: ledger.admissions,
    queues: ledger.queues,
    reads: ledger.reads,
    bindings: stub(spies, 'bindings', ['inspect', 'resolve', 'recover']),
    environments: stub(spies, 'environments', [
      'prepare',
      'inspectPreparation',
      'release',
      'inspectRelease',
    ]),
    decisions: stub(spies, 'decisions', [
      'inspectOperation',
      'ensure',
      'inspect',
      'invalidate',
      'resolve',
    ]),
    instances: host,
    clock,
    resultPolicy: defaultResultPolicy,
    authority: stub(spies, 'authority', ['exclude', 'prepare', 'consume', 'inspect', 'invalidate']),
    resources: stub(spies, 'resources', [
      'inspectOperation',
      'ensure',
      'inspect',
      'expire',
      'invalidate',
      'resolve',
    ]),
    custody: stub(spies, 'custody', ['preserve', 'inspect', 'retainResult']),
    catalog: stub(spies, 'catalog', ['inspect', 'usage', 'search']),
    children: stub(spies, 'children', ['reserve', 'admitted', 'retain', 'close', 'confirmBarrier']),
  }
  const provider = createToolRuntime(dependencies, config)
  return { store, ledger, provider, runtime: provider.runtime, spies, host }
}

/** A ledger over another store, for a store that the memory store cannot imitate. */
export function ledgerOver(
  store: ToolLedgerStore<Block>,
  options: HarnessOptions = {},
): ToolLedger<Principal, Block> {
  const spies: Spies = { calls: new Map() }
  const clock = stub<ToolDependencies<Principal, Block, null>['clock']>(spies, 'clock', ['now'])
  return createToolLedger(store, guards(options), clock, configurationOf(options))
}

/** Every state the runtime answers must pass the contract's closed judgment. */
export function judged(state: ToolState): ToolState {
  const verdict = judgeToolState(state)
  if ('failure' in verdict)
    throw new Error(`illegal state: ${verdict.failure.field}: ${verdict.failure.reason}`)
  return verdict.ok
}

export function ok<T>(outcome: Outcome<T, unknown>): T {
  if (!('ok' in outcome)) throw new Error(`expected success: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

export function failure<F>(outcome: Outcome<unknown, F>): F {
  if (!('failure' in outcome)) throw new Error(`expected failure: ${JSON.stringify(outcome)}`)
  return outcome.failure
}

/** The mutation input of one admission. */
export function admission(
  call: string,
  operation: string,
  body: FixedToolRequest = request(),
  principal: Principal = principalA,
  within: TenantShape = tenantA,
) {
  return {
    principal,
    tenant: within,
    call: callId(call),
    operation: operationId(operation),
    request: body,
  }
}

/**
 * A store over `memory` that runs `land` once, just before the first commit that `matches`, as
 * another writer that committed between the caller's read and its commit would. What `land`
 * commits through this store is forwarded without a second interception.
 */
export function interleaving(
  memory: ToolLedgerStore<Block>,
  matches: (input: LedgerCommitInput<Block>) => boolean,
  land: () => Promise<unknown>,
): ToolLedgerStore<Block> {
  let armed = true
  return {
    durability: 'none',
    read: domain => memory.read(domain),
    commit: async input => {
      if (armed && matches(input)) {
        armed = false
        await land()
      }
      return memory.commit(input)
    },
  }
}

/** Whether a commit writes the operation record of `operation`: the commit of that operation. */
export function putsOperation(operation: string): (input: LedgerCommitInput<Block>) => boolean {
  return input =>
    input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'operation' &&
        write.record.operation.operation === operation,
    )
}

/** Whether a commit writes an exclusion record: the fence of a negative answer. */
export function putsExclusion(input: LedgerCommitInput<Block>): boolean {
  return input.writes.some(write => write.kind === 'put' && write.record.kind === 'exclusion')
}
