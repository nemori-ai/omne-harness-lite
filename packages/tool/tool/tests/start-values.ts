// A real runtime and ledger over the non-durable store, with controllable ports for the way from
// an admission to a start: an environment provider, a live-only binding whose start stages a
// capsule and consumes the permit, a start authority and a clock. The authority here is a small
// in-memory stand-in with the P04 answers the driver relies on; the local start coordinator of
// `tool-host-local` is tested against the same runtime in that package.
// admitCall supplies trusted internal admission facts for named-call startup/queue tests.
// Public invoke uses the real paired source and a source-verifying ledger over the same store.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  type DurableEvidence,
  type FixedToolRequest,
  type StartPermit,
  type StartProgress,
  type ToolBindings,
  type ToolCallId,
  type ToolClock,
  type ToolEnvironment,
  type ToolExecutorBinding,
  type ToolFailure,
  type ToolLiveExecution,
  type ToolStartRecord,
  type ToolExecutionFact,
  type ToolOutputCustody,
  type ToolStartAuthority,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  createToolLedger,
  createToolFactAcknowledgementGuard,
  createToolRuntime,
  type LedgerCommitInput,
  type ToolDependencies,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolExecutorBinding } from '@omne-harness/tool-contract/testing'
import {
  createTestInvocationSource,
  createTestToolIdentities,
  type TestInvocationSource,
  type TestToolIdentities,
  createMemoryToolLedgerStore,
  type MemoryToolLedgerStore,
} from '@omne-harness/tool/testing'
import {
  callId,
  invokeAuthority,
  snapshotTestPrincipal,
  fixedRequestForNamedSourceGuard,
  configurationOf,
  evidence,
  fixedOf,
  guards,
  instanceId,
  judged,
  ok,
  operationId,
  principalA,
  referenceFor,
  request,
  tenantA,
  testHost,
  type Block,
  type HarnessOptions,
  type Principal,
  type Spies,
  type TestHost,
  testSettlementPorts,
} from './runtime-values.ts'

/** What the environment provider answers for a call's preparation. */
export type EnvironmentAnswer = 'prepared' | 'rejected' | 'unavailable' | 'pending' | 'unknown'

export type StartOptions = HarnessOptions &
  Readonly<{
    /** The answer of the environment provider by call; `prepared` when absent. */
    environment?: ReadonlyMap<string, EnvironmentAnswer>
    authority?: TestAuthority
    binding?: TestBinding
    authorityPort?: (base: TestAuthority) => ToolStartAuthority<Principal>
    environmentsPort?: (base: TestEnvironments) => ToolEnvironment<Principal, TestEnvironment>
    bindingPort?: (base: LiveBinding) => LiveBinding
    bindingsPort?: (
      base: ToolBindings<Principal, Block, TestEnvironment>,
    ) => ToolBindings<Principal, Block, TestEnvironment>
    custodyPort?: (base: ToolOutputCustody<Principal>) => ToolOutputCustody<Principal>
    /** Builds over this memory instead of a new one: a second runtime over the same records. */
    memory?: MemoryToolLedgerStore<Block>
    /** Wraps the memory store, to make one commit or read of the start path misbehave. */
    store?: (memory: MemoryToolLedgerStore<Block>) => ToolLedgerStore<Block>
    readsPort?: (
      base: ToolDependencies<Principal, Block, TestEnvironment>['reads'],
    ) => ToolDependencies<Principal, Block, TestEnvironment>['reads']
    /** Wraps the commands the driver writes through, to observe what each command answered. */
    commands?: (
      base: ToolDependencies<Principal, Block, TestEnvironment>['commands'],
    ) => ToolDependencies<Principal, Block, TestEnvironment>['commands']
  }>

/**
 * The stand-in start authority (P04). A start is accepted at most once; `refuse` makes the next
 * consume of a call answer `rejected`, as an invalidation that holds before the acceptance does;
 * `inspect` of an undecided start withdraws the outstanding permit before it answers
 * `not-started`, or answers `unknown` for a call marked `uncertain`; `exclude` rejects the whole
 * pending invocation of a call without an acceptance.
 */
export type TestAuthority = ToolStartAuthority<Principal> &
  Readonly<{
    refuse(call: string): void
    uncertain(call: string): void
    reveal(call: string): void
    readonly consumed: string[]
    readonly accepted: string[]
    readonly excluded: string[]
  }>

function testAuthority(): TestAuthority {
  const accepted = new Map<string, DurableEvidence>()
  const rejected = new Map<string, Readonly<{ reason: string; exclusion: DurableEvidence }>>()
  const permits = new Map<string, number>()
  const refused = new Set<string>()
  const uncertain = new Set<string>()
  const consumed: string[] = []
  const acceptedCalls: string[] = []
  const excluded: string[] = []
  let issued = 0
  const progress = (call: string): StartProgress | null => {
    const acceptance = accepted.get(call)
    if (acceptance !== undefined) return { kind: 'started', acceptance }
    const rejection = rejected.get(call)
    return rejection === undefined ? null : { kind: 'rejected', ...rejection }
  }
  return {
    refuse: call => refused.add(call),
    uncertain: call => uncertain.add(call),
    reveal: call => void uncertain.delete(call),
    consumed,
    accepted: acceptedCalls,
    excluded,
    prepare: input => {
      issued += 1
      permits.set(input.call, issued)
      const permit: StartPermit = {
        tenant: input.tenant,
        call: input.call,
        operation: input.start.operation,
        adoption: evidenceAdoption('authority'),
        inputDigest: `sha256:${input.call}`,
        start: input.start,
        guards: [],
        request: { ...evidence(`permit-${input.call}`), revision: String(issued) },
      }
      return Promise.resolve(succeed(permit))
    },
    consume: input => {
      consumed.push(input.call)
      const known = progress(input.call)
      if (known !== null) return Promise.resolve(succeed(known))
      if (permits.get(input.call) !== Number(input.permit.request.revision))
        return Promise.resolve(
          succeed({ kind: 'not-started', exclusion: evidence(`excluded-${input.call}`) }),
        )
      permits.delete(input.call)
      if (refused.has(input.call)) {
        const rejection = {
          reason: 'guard invalidated',
          exclusion: evidence(`rejected-${input.call}`),
        }
        rejected.set(input.call, rejection)
        return Promise.resolve(succeed({ kind: 'rejected', ...rejection }))
      }
      const acceptance = evidence(`accepted-${input.call}`)
      accepted.set(input.call, acceptance)
      acceptedCalls.push(input.call)
      return Promise.resolve(succeed({ kind: 'started', acceptance }))
    },
    inspect: input => {
      if (uncertain.has(input.call))
        return Promise.resolve(succeed({ kind: 'unknown', diagnostic: 'the ledger is behind' }))
      const known = progress(input.call)
      if (known !== null) return Promise.resolve(succeed(known))
      permits.delete(input.call)
      return Promise.resolve(
        succeed({ kind: 'not-started', exclusion: evidence(`excluded-${input.call}`) }),
      )
    },
    exclude: input => {
      if (accepted.has(input.call))
        return Promise.resolve(fail({ kind: 'conflict', operation: input.operation }))
      excluded.push(input.call)
      const exclusion = evidence(`call-excluded-${input.call}`)
      rejected.set(input.call, { reason: input.reason, exclusion })
      return Promise.resolve(succeed(exclusion))
    },
    invalidate: () => Promise.resolve(succeed(evidence('invalidated'))),
  }
}

function evidenceAdoption(name: string) {
  return { owner: 'test-owner', name, revision: '1', digest: `sha256:${name}` }
}

/** The environment a prepared call runs in: the call it was prepared for. */
export type TestEnvironment = Readonly<{ preparedFor: string }>

/**
 * `prepared` lists the calls the provider was asked to prepare, `inspected` those whose record it
 * was asked to read; `answer` changes what it says for a call from the next question on.
 */
export type TestEnvironments = ToolEnvironment<Principal, TestEnvironment> &
  Readonly<{
    readonly prepared: string[]
    readonly inspected: string[]
    answer(call: string, answer: EnvironmentAnswer): void
  }>

function testEnvironments(initial: ReadonlyMap<string, EnvironmentAnswer>): TestEnvironments {
  const answers = new Map(initial)
  const prepared: string[] = []
  const inspected: string[] = []
  const answer = (
    call: ToolCallId,
    preparation: Parameters<TestEnvironments['prepare']>[0]['preparation'],
  ) => {
    const kind = answers.get(call) ?? 'prepared'
    if (kind === 'unavailable')
      return fail<ToolFailure>({
        kind: 'unavailable',
        dependency: 'test-environment',
        diagnostic: 'the sandbox host is down',
      })
    if (kind === 'pending' || kind === 'unknown')
      return succeed({ kind, diagnostic: `the provider says ${kind}` })
    if (kind === 'rejected')
      return succeed({
        kind: 'rejected' as const,
        reason: 'isolation cannot be confirmed',
        evidence: evidence(`environment-rejected-${call}`),
      })
    return succeed({
      kind: 'prepared' as const,
      environment: {
        value: { preparedFor: call },
        evidence: evidence(`environment-${call}`),
        preparation,
      },
    })
  }
  return {
    prepared,
    inspected,
    answer: (call, next) => void answers.set(call, next),
    prepare: input => {
      prepared.push(input.call)
      return Promise.resolve(answer(input.call, input.preparation))
    },
    inspectPreparation: input => {
      inspected.push(input.call)
      return Promise.resolve(answer(input.call, input.preparation))
    },
    release: () => Promise.reject(new Error('release is not on the way to a start')),
    inspectRelease: () => Promise.reject(new Error('release is not on the way to a start')),
  }
}

/**
 * A live-only binding. Its start stages a capsule (the executor receipt), then lets the authority
 * consume the permit; only an acceptance runs the executor. `attempts` lists every start the
 * binding was asked for, `executions` every executor run, `environments` what each run got.
 */
export type TestBinding = Readonly<{
  bindings: ToolBindings<Principal, Block, TestEnvironment>
  readonly attempts: string[]
  readonly executions: string[]
  readonly environments: TestEnvironment[]
  readonly inspected: ToolStartRecord[]
  readonly capsules: DurableEvidence[]
  readonly controls: ReturnType<
    typeof createMemoryToolExecutorBinding<Principal, TestEnvironment>
  >['controls']
}>

type LiveBinding = Extract<
  ToolExecutorBinding<Principal, Block, TestEnvironment>,
  { kind: 'live-only' }
>

function requireMessageResultBlock(block: ContentBlock): Block {
  if (block.kind === 'text' || 'ref' in block) return block
  throw new Error('the start fixture accepts only message-result blocks')
}

function messageExecution(execution: ToolLiveExecution<ContentBlock>): ToolLiveExecution<Block> {
  return {
    ...execution,
    facts: async function* (input) {
      for await (const batch of execution.facts(input)) {
        yield {
          ...batch,
          events: batch.events.map(event => ({ ...event, fact: messageFact(event.fact) })),
        }
      }
    },
  }
}

function messageFact(fact: ToolExecutionFact<ContentBlock>): ToolExecutionFact<Block> {
  if (fact.kind !== 'final') return fact
  const result = fact.result
  return {
    ...fact,
    result: {
      ...result,
      content: result.content.map(requireMessageResultBlock),
      original:
        result.original.kind === 'none'
          ? result.original
          : {
              ...result.original,
              summary: result.original.summary.map(requireMessageResultBlock),
            },
    },
  }
}

function testBinding(
  authority: ToolStartAuthority<Principal>,
  wrap: (base: LiveBinding) => LiveBinding = base => base,
): TestBinding {
  const attempts: string[] = []
  const executions: string[] = []
  const environments: TestEnvironment[] = []
  const inspected: ToolStartRecord[] = []
  const capsules: DurableEvidence[] = []
  const executor = createMemoryToolExecutorBinding<Principal, TestEnvironment>()
  const binding = wrap({
    kind: 'live-only',
    start: async (input, environment) => {
      attempts.push(input.call)
      const capsule = evidence(`capsule-${input.call}`)
      capsules.push(capsule)
      const consumed = await authority.consume({
        principal: input.principal,
        tenant: input.tenant,
        call: input.call,
        permit: input.permit,
        executorReceipt: capsule,
      })
      if ('failure' in consumed) return consumed
      if (consumed.ok.kind !== 'started')
        return fail({
          kind: 'unavailable',
          dependency: 'test-executor',
          diagnostic: `the start was not accepted: ${consumed.ok.kind}`,
        })
      const live = await executor.binding.start(input, environment)
      if ('failure' in live) return live
      executions.push(input.call)
      environments.push(environment)
      return succeed(messageExecution(live.ok))
    },
    inspectStart: async input => {
      inspected.push(input.start)
      const found = await executor.binding.inspectStart(input)
      if ('failure' in found) return found
      if (found.ok.kind === 'settled') {
        const fact = messageFact(found.ok.fact)
        if (fact.kind !== 'final') throw new Error('the executor final is not final')
        return succeed({ ...found.ok, fact })
      }
      return found.ok.kind === 'live'
        ? succeed({ kind: 'live', execution: messageExecution(found.ok.execution) })
        : succeed(found.ok)
    },
  })
  return {
    attempts,
    executions,
    environments,
    inspected,
    capsules,
    controls: executor.controls,
    bindings: {
      inspect: () => Promise.reject(new Error("inspect is the Catalog's")),
      resolve: () => Promise.resolve(succeed(binding)),
      recover: () => Promise.reject(new Error('recover belongs to recovery')),
    },
  }
}

/** The clock stand-in; `begun` lists the call of every timing segment it was asked to begin. */
type TestClock = ToolClock & Readonly<{ readonly begun: string[] }>

function testClock(): TestClock {
  const begun: string[] = []
  return {
    begun,
    now: () => '2026-10-17T00:00:00.000Z',
    begin: input => {
      begun.push(input.execution.call)
      return Promise.resolve(
        succeed({
          operation: input.operation,
          source: 'test-clock',
          epoch: 'epoch-1',
          marker: evidence(`segment-${input.execution.call}`),
        }),
      )
    },
    elapsed: () => Promise.reject(new Error('elapsed belongs to timing')),
    waitUntil: () => Promise.reject(new Error('waitUntil belongs to timing')),
  }
}

function refusing<T extends object>(name: string, methods: readonly string[]): T {
  const out: Record<string, unknown> = {}
  for (const method of methods)
    out[method] = () => Promise.reject(new Error(`${name}.${method} is not on the way to a start`))
  // Every method of the port rejects, so the object has the port's shape at run time.
  return out as T
}

export type StartHarness = Readonly<{
  memory: MemoryToolLedgerStore<Block>
  runtime: ReturnType<typeof createToolRuntime<Principal, Block, TestEnvironment>>['runtime']
  rebuildRuntime(): ReturnType<
    typeof createToolRuntime<Principal, Block, TestEnvironment>
  >['runtime']
  commands: ToolDependencies<Principal, Block, TestEnvironment>['commands']
  ledger: ReturnType<typeof createToolLedger<Principal, Block>>
  host: TestHost
  authority: TestAuthority
  binding: TestBinding
  environments: TestEnvironments
  identities: TestToolIdentities
  source: TestInvocationSource<Principal>
  custody: ToolOutputCustody<Principal>
  internalRequests: Map<string, FixedToolRequest>
  /** The calls whose timing segment the clock was asked to begin. */
  begun: readonly string[]
  /** Runs the drivers of these calls concurrently, then every wake-up they caused. */
  drive(...calls: readonly string[]): Promise<void>
  /** One run of the driver of this call, without following the wake-ups it asks for. */
  runOnce(call: string, signal?: AbortSignal): Promise<void>
  /** The queue maintenance entry of the ledger. */
  queues: ToolDependencies<Principal, Block, TestEnvironment>['queues']
  /** The calls the queue domain of the default key holds a tombstone for. */
  released(): Promise<readonly string[]>
  /** The current state of a call admitted with `op-<call>`. */
  state(call: string): Promise<ToolState>
  /** The queue entries of the default request's FIFO key, as the queue domain holds them. */
  queue(): Promise<readonly Readonly<{ call: string; ordinal: string; stage: string }>[]>
}>

export function startHarness(options: StartOptions = {}): StartHarness {
  const memory = options.memory ?? createMemoryToolLedgerStore<Block>()
  const store = options.store === undefined ? memory : options.store(memory)
  const spies: Spies = { calls: new Map() }
  const clock = testClock()
  const config = configurationOf(options)
  const source = createTestInvocationSource<Principal>({
    authority: invokeAuthority(options),
    snapshotPrincipal: snapshotTestPrincipal,
  })
  const identities = createTestToolIdentities()
  const host = testHost(spies, identities.instanceIdentities)
  const authority = options.authority ?? testAuthority()
  const authorityPort = options.authorityPort?.(authority) ?? authority
  const binding = options.binding ?? testBinding(authorityPort, options.bindingPort)
  const bindings = options.bindingsPort?.(binding.bindings) ?? binding.bindings
  const factAcknowledgements = createToolFactAcknowledgementGuard(bindings)
  const environments = testEnvironments(options.environment ?? new Map())
  const originalCustody = testSettlementPorts().custody
  const custody = options.custodyPort?.(originalCustody) ?? originalCustody
  const settlement = { custody, releaseInspection: environments }
  const ledger = createToolLedger(
    store,
    { ...guards(options), factAcknowledgements },
    clock,
    config,
    settlement,
  )
  const publicLedger = createToolLedger(
    store,
    { ...guards(options), sources: source.guard, factAcknowledgements },
    clock,
    config,
    settlement,
  )
  const dependencies: ToolDependencies<Principal, Block, TestEnvironment> = {
    commands: options.commands?.(ledger.commands) ?? ledger.commands,
    admissions: publicLedger.admissions,
    queues: ledger.queues,
    facts: ledger.facts,
    reads: options.readsPort?.(ledger.reads) ?? ledger.reads,
    bindings,
    environments: options.environmentsPort?.(environments) ?? environments,
    decisions: refusing('decisions', [
      'inspectOperation',
      'ensure',
      'inspect',
      'invalidate',
      'resolve',
    ]),
    instances: host,
    clock,
    resultPolicy: guards().policy,
    authority: authorityPort,
    resources: refusing('resources', [
      'inspectOperation',
      'ensure',
      'inspect',
      'expire',
      'invalidate',
      'resolve',
    ]),
    custody,
    catalog: refusing('catalog', ['inspect', 'usage', 'search']),
    children: refusing('children', ['reserve', 'admitted', 'retain', 'close', 'confirmBarrier']),
    operationIdentities: identities.operationIdentities,
    sourceIssuer: source.issuer,
  }
  const provider = createToolRuntime(dependencies, config)
  const drive = async (...calls: readonly string[]) => {
    // Wake-ups from before, such as the admissions', are hints this drive does not follow.
    host.scheduled.splice(0)
    await Promise.all(calls.map(call => host.runCall(callId(call))))
    await host.runScheduled()
  }
  const runOnce = async (call: string, signal = new AbortController().signal) =>
    host.driver().run({
      principal: principalA,
      tenant: tenantA,
      call: callId(call),
      instance: await host.instanceOf(callId(call)),
      signal,
    })
  const released = async () => {
    const read = await memory.read({ kind: 'queue', tenant: tenantA, key: queueKey() })
    if (read.kind !== 'complete') throw new Error('the queue domain is unreadable')
    return read.records.flatMap(record =>
      record.kind === 'queue-release' ? [record.release.call as string] : [],
    )
  }
  const state = async (call: string) => {
    const found = ok(
      await provider.runtime.queries.lookup({
        principal: principalA,
        tenant: tenantA,
        reference: referenceFor(call, `op-${call}`),
      }),
    )
    if (found.kind !== 'found') throw new Error(`${call} was not admitted`)
    return judged(found.state)
  }
  const queue = async () => {
    const read = await memory.read({ kind: 'queue', tenant: tenantA, key: queueKey() })
    if (read.kind !== 'complete') throw new Error('the queue domain is unreadable')
    return read.records.flatMap(record =>
      record.kind === 'queue-entry'
        ? [
            {
              call: record.entry.call as string,
              ordinal: record.entry.ordinal,
              stage: record.entry.stage,
            },
          ]
        : [],
    )
  }
  const built: StartHarness = {
    internalRequests: new Map(),
    memory,
    runtime: provider.runtime,
    rebuildRuntime: () => createToolRuntime(dependencies, config).runtime,
    commands: ledger.commands,
    // Internal admission recall tests carry source facts from the previous harness.
    ledger: createToolLedger(
      store,
      { ...guards(options), factAcknowledgements },
      clock,
      config,
      settlement,
    ),
    queues: ledger.queues,
    host,
    authority,
    binding,
    environments,
    identities,
    source,
    custody,
    begun: clock.begun,
    drive,
    runOnce,
    released,
    state,
    queue,
  }
  audited.push(built)
  return built
}

const audited: StartHarness[] = []

/** One call domain of the default tenant, as the records hold it. */
async function callRecords(harness: StartHarness, call: string) {
  const read = await harness.memory.read({
    kind: 'call',
    tenant: tenantA as never,
    call: callId(call),
  })
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  return read.records
}

/**
 * Why the queue entry of `call` is not accounted for by its call domain, or null (SPEC 22). An
 * entry repeats a fact that its call owns, so every unreleased entry must be reachable from that
 * call: the call owes the queue domain a step (an open `queue` task), or its state already shows
 * the entry's stage, or the entry is held and the call committed the operation that held it.
 */
async function unaccounted(
  harness: StartHarness,
  entry: Readonly<{ call: string; ordinal: string; stage: string; operation: string }>,
): Promise<string | null> {
  const records = await callRecords(harness, entry.call)
  const record = records.find(candidate => candidate.kind === 'call')
  if (record?.kind !== 'call') return 'the call has no call record'
  if (records.some(candidate => candidate.kind === 'task' && candidate.task.kind === 'queue'))
    return null
  const { state } = record.call
  const shown: Record<string, boolean> = {
    preparing: state.phase === 'preparing' && state.queue.kind === 'waiting',
    ready: state.phase === 'queued' && state.queue.kind === 'waiting',
    held: state.queue.kind === 'held',
  }
  if (
    shown[entry.stage] === true &&
    state.queue.kind !== 'none' &&
    state.queue.ordinal === entry.ordinal
  )
    return null
  const committed = records.some(
    candidate =>
      candidate.kind === 'operation' && candidate.operation.operation === entry.operation,
  )
  if (entry.stage === 'held' && committed) return null
  return `entry ${entry.stage} (op ${entry.operation}) of a call in ${state.phase} with no queue task`
}

/**
 * The accounting invariant of the queue entries (SPEC 22), checked over every harness this test
 * built: every unreleased entry is accounted for by its call domain, and no call has both an
 * entry and a tombstone. A violation is an entry that nothing would ever move or remove.
 */
export async function auditQueues(): Promise<void> {
  const harnesses = audited.splice(0)
  const problems: string[] = []
  for (const harness of harnesses) {
    const read = await harness.memory.read({
      kind: 'queue',
      tenant: tenantA as never,
      key: queueKey(),
    })
    if (read.kind !== 'complete') continue
    const tombstones = new Set<string>()
    for (const record of read.records)
      if (record.kind === 'queue-release') tombstones.add(record.release.call as string)
    for (const record of read.records) {
      if (record.kind !== 'queue-entry') continue
      const { entry } = record
      if (tombstones.has(entry.call)) problems.push(`${entry.call}: an entry beside its tombstone`)
      const why = await unaccounted(harness, { ...entry, operation: entry.operation })
      if (why !== null) problems.push(`${entry.call}: ${why}`)
    }
  }
  if (problems.length > 0)
    throw new Error(`queue entries nothing accounts for: ${problems.join('; ')}`)
}

/** The FIFO key of the default request (P02: scope owner, scope key, tool name). */
export function queueKey(): string {
  const { scope } = request()
  return JSON.stringify([scope.owner, scope.key, 'read_file'])
}

export async function admitCall(
  harness: StartHarness,
  call: string,
  overrides: Parameters<typeof request>[0] = {},
): Promise<ToolState> {
  const fixed = fixedRequestForNamedSourceGuard(request(overrides))
  harness.internalRequests.set(call, fixed)
  const outcome = await harness.ledger.admissions.admit({
    principal: principalA,
    tenant: tenantA,
    call: callId(call),
    operation: operationId(`op-${call}`),
    request: fixed,
  })
  if ('failure' in outcome)
    throw new Error(
      `the internal admission of ${call} was not accepted: ${JSON.stringify(outcome)}`,
    )
  return outcome.ok.state
}

/** The write context of the next command on `call`, at the call's current state revision. */
export async function writeContext(harness: StartHarness, call: string, operation: string) {
  const state = await harness.state(call)
  return {
    principal: principalA,
    tenant: tenantA,
    call: callId(call),
    instance: instanceId,
    generation: '1',
    operation: operationId(operation),
    expected: state.revision,
  }
}

/** Takes an admitted call to `starting` through the commands, without the driver. */
export async function toStarting(harness: StartHarness, call: string) {
  const preparation = ok(
    await harness.commands.planPreparation({
      ...(await writeContext(harness, call, `${call}/plan`)),
      request: fixedOf(harness.internalRequests, call),
      purpose: 'initial',
    }),
  )
  ok(
    await harness.commands.prepared({
      ...(await writeContext(harness, call, `${call}/prepared`)),
      preparation,
      resources: { owner: 'o', record: 'env', revision: '1', digest: 'd' },
    }),
  )
  ok(await harness.commands.enqueue(await writeContext(harness, call, `${call}/enqueue`)))
  return ok(await harness.commands.prepareStart(await writeContext(harness, call, `${call}/start`)))
    .start
}

/**
 * A store over `memory` whose commits matching `matches` answer `fault` the first `times` times
 * instead of committing, as a store whose answer was lost would: `dropped` writes nothing,
 * `applied` writes and still answers unknown.
 */
export function losingCommits(
  memory: ToolLedgerStore<Block>,
  matches: (input: LedgerCommitInput<Block>) => boolean,
  fault: 'dropped' | 'applied' | 'unavailable',
  times = 1,
): ToolLedgerStore<Block> {
  let left = times
  return {
    durability: 'none',
    read: domain => memory.read(domain),
    commit: async input => {
      if (left === 0 || !matches(input)) return memory.commit(input)
      left -= 1
      if (fault === 'unavailable') return { kind: 'unavailable', diagnostic: 'the store is down' }
      if (fault === 'applied') await memory.commit(input)
      return { kind: 'unknown', diagnostic: 'the answer was lost' }
    },
  }
}

/**
 * A store over `memory` that runs `land` once, right after the n-th read of a call domain that
 * follows `arm(n)`, as a reader that answered a negative between two reads of a command would.
 * What `land` reads or commits through this store is forwarded without a second interception.
 * The command under test reads its call domain first to decide whether it may touch the queue or
 * a port (read 1); the transaction then reads again (read 2, or 3 after a port's own re-read).
 */
export function landingAfterRead(
  memory: ToolLedgerStore<Block>,
  land: () => Promise<unknown>,
): Readonly<{ store: ToolLedgerStore<Block>; arm(afterReads: number): void }> {
  let left = 0
  return {
    arm: afterReads => {
      left = afterReads
    },
    store: {
      durability: 'none',
      read: async domain => {
        const result = await memory.read(domain)
        if (left > 0 && domain.kind === 'call') {
          left -= 1
          if (left === 0) await land()
        }
        return result
      },
      commit: input => memory.commit(input),
    },
  }
}
