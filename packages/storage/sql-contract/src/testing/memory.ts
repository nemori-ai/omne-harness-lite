// The memory double of `SqlStorage`: the same contract without SQLite, Workers or files of data.
//
// What it models: field rules, the control-side rejection order, registration, execution order of
// participants, the fact port, failure categories, response evidence, recognition by the full
// identity, partition by scope, observation cancel and close. What it does not model, because it
// has no database: SQL execution (a participant that calls `port.execute` is a port violation),
// durability, Worker failure, domain states beyond absent, ready and closed, queue limits and
// reads of real rows. Its durability is `none`. A pass of the double proves none of the omitted
// properties.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { canonicalJson, isStrictJson, jsonShape, utf8Length } from '../canonical.ts'
import { inputDigestV2 } from '../digest.ts'
import {
  DOMAIN_BYTES,
  clipDiagnostic,
  decodeIdentity,
  decodeScope,
  isDigest,
  isName,
  scopeKey,
} from '../fields.ts'
import { combinationManifest, manifestDigest } from '../manifest.ts'
import type {
  CombinationRegistrationV2,
  CommitRejectReason,
  CommitRequestV2,
  CommitResultV2,
  FactKey,
  FailureCategory,
  JsonValue,
  ParticipantDescriptor,
  ParticipatedEntry,
  QueryResultV2,
  ReadRequest,
  ReadResult,
  ReceiptV2,
  RecordedReply,
  RegisterRejectReason,
  RegisterResultV2,
  SqlIdentity,
  SqlMaterialCatalog,
  SqlStorage,
  StorageControl,
  StorageScope,
  StoppingEntry,
} from '../types.ts'
import type {
  HandlerOutcome,
  ParticipantModule,
  ParticipantPort,
  ReadHandlerModule,
} from '../worker.ts'

export type MemorySqlStorageLimits = Readonly<{
  maxCommandsPerCommit: number
  maxCommandBytes: number
  maxRequestBytes: number
  maxResponseBytes: number
  maxOperationResponseBytes: number
  maxDiagnosticBytes: number
  maxReadInputBytes: number
  maxJsonDepth: number
  maxJsonMembers: number
}>

const DEFAULT_LIMITS: MemorySqlStorageLimits = {
  maxCommandsPerCommit: 64,
  maxCommandBytes: 1 << 20,
  maxRequestBytes: 4 << 20,
  maxResponseBytes: 64 << 10,
  maxOperationResponseBytes: 256 << 10,
  maxDiagnosticBytes: 512,
  maxReadInputBytes: 64 << 10,
  maxJsonDepth: 64,
  maxJsonMembers: 100_000,
}

export type MemorySqlStorageInput = Readonly<{
  materials: SqlMaterialCatalog
  limits?: Partial<MemorySqlStorageLimits>
}>

// --- Serial execution: one job at a time, in arrival order ---------------------------------------

type Job = Readonly<{ start(): Promise<void>; withdraw(): void }>

class SerialQueue {
  private active = false
  private readonly waiting: Job[] = []
  private readonly idleWaiters: (() => void)[] = []

  /** The first job starts at once, so it is "started" when `submit` returns. */
  submit(job: Job): void {
    if (this.active) this.waiting.push(job)
    else this.begin(job)
  }

  withdrawWaiting(): void {
    for (const job of this.waiting.splice(0)) job.withdraw()
  }

  whenIdle(): Promise<void> {
    if (!this.active) return Promise.resolve()
    return new Promise(resolve => this.idleWaiters.push(resolve))
  }

  private begin(job: Job): void {
    this.active = true
    void job.start().then(() => {
      const next = this.waiting.shift()
      if (next !== undefined) return this.begin(next)
      this.active = false
      for (const resolve of this.idleWaiters.splice(0)) resolve()
    })
  }
}

// --- Materials -------------------------------------------------------------------------------------

async function digestOfFile(moduleUrl: string): Promise<string | null> {
  try {
    const url = new URL(moduleUrl)
    if (url.protocol !== 'file:') return null
    return createHash('sha256')
      .update(await readFile(fileURLToPath(url)))
      .digest('hex')
  } catch {
    return null
  }
}

/** Construction checks static materials only (SPEC 4.1, 4.2), as the provider factory does. */
async function verifyMaterials(catalog: SqlMaterialCatalog): Promise<void> {
  const problems: string[] = []
  const files: [string, string, string][] = [
    ...catalog.participants.map((item): [string, string, string] => [
      `participant ${item.participant}`,
      item.moduleUrl,
      item.codeDigest,
    ]),
    ...catalog.migrations.map((item): [string, string, string] => [
      `migration ${item.owner}/${item.id}`,
      item.moduleUrl,
      item.checksum,
    ]),
    ...catalog.readHandlers.map((item): [string, string, string] => [
      `handler ${item.handler}`,
      item.moduleUrl,
      item.codeDigest,
    ]),
  ]
  for (const [material, moduleUrl, expected] of files) {
    const actual = await digestOfFile(moduleUrl)
    if (actual === null) problems.push(`material_unreadable: ${material}`)
    else if (actual !== expected) problems.push(`material_digest_mismatch: ${material}`)
  }
  for (const [kind, declared] of Object.entries(catalog.declaredCombinations)) {
    if (declared === null) continue
    const result = combinationManifest({ catalog, participants: declared.participants })
    if (result.kind !== 'manifest') problems.push(`declared_combination_invalid: ${kind}`)
  }
  if (problems.length > 0) throw new Error(`construction rejected: ${problems.join('; ')}`)
}

// --- State ------------------------------------------------------------------------------------------

type StoredRegistration = Readonly<{
  registration: CombinationRegistrationV2
}>

type Domain = {
  readonly scope: StorageScope
  readonly registrations: Map<string, StoredRegistration>
  readonly receipts: Map<string, ReceiptV2>
}

const factId = (fact: FactKey): string => JSON.stringify([fact.key, fact.protocol])
const receiptKey = (identity: SqlIdentity): string =>
  JSON.stringify([identity.operation, identity.operationKey])
const sortNames = (names: readonly string[]): string[] => [...names].sort()

type PortViolation = 'port_violation' | 'fact_violation'

class FactPort implements ParticipantPort {
  violation: PortViolation | null = null
  private closed = false
  readonly provided = new Map<string, JsonValue>()

  private readonly descriptor: ParticipantDescriptor
  private readonly facts: ReadonlyMap<string, JsonValue>

  constructor(descriptor: ParticipantDescriptor, facts: ReadonlyMap<string, JsonValue>) {
    this.descriptor = descriptor
    this.facts = facts
  }

  close(): void {
    this.closed = true
  }

  private violate(category: PortViolation, text: string): never {
    this.violation ??= category
    this.closed = true
    throw new Error(text)
  }

  private guard(): void {
    if (this.closed) this.violate(this.violation ?? 'port_violation', 'port is closed')
  }

  execute(): never {
    this.guard()
    return this.violate('port_violation', 'the memory double has no SQL')
  }

  requireFact(key: FactKey): JsonValue {
    this.guard()
    if (!this.descriptor.requiresFacts.some(fact => factId(fact) === factId(key)))
      this.violate('fact_violation', 'fact not declared as required')
    const value = this.facts.get(factId(key))
    if (value === undefined) this.violate('fact_violation', 'fact was not provided')
    return structuredClone(value)
  }

  provideFact(key: FactKey, value: JsonValue): void {
    this.guard()
    if (!this.descriptor.providesFacts.some(fact => factId(fact) === factId(key)))
      this.violate('fact_violation', 'fact not declared as provided')
    if (this.provided.has(factId(key))) this.violate('fact_violation', 'fact provided twice')
    if (!isStrictJson(value)) this.violate('fact_violation', 'fact is not JSON')
    this.provided.set(factId(key), structuredClone(value))
  }
}

type Outcome =
  | Readonly<{
      kind: 'participated'
      reply: RecordedReply
      provided: ReadonlyMap<string, JsonValue>
    }>
  | Readonly<{ kind: 'stopped'; reply: RecordedReply }>

class MemorySqlStorage implements SqlStorage {
  closing = false
  readonly queue = new SerialQueue()
  private readonly domains = new Map<string, Domain>()
  private readonly modules = new Map<string, Promise<unknown>>()
  private readonly descriptors: ReadonlyMap<string, ParticipantDescriptor>

  private readonly catalog: SqlMaterialCatalog
  private readonly limits: MemorySqlStorageLimits

  constructor(catalog: SqlMaterialCatalog, limits: MemorySqlStorageLimits) {
    this.catalog = catalog
    this.limits = limits
    this.descriptors = new Map(catalog.participants.map(item => [item.participant, item]))
  }

  private diagnostic(text: string): string {
    return clipDiagnostic(text, this.limits.maxDiagnosticBytes)
  }

  private load(moduleUrl: string): Promise<unknown> {
    let loaded = this.modules.get(moduleUrl)
    if (loaded === undefined) {
      loaded = import(/* @vite-ignore */ moduleUrl)
      this.modules.set(moduleUrl, loaded)
    }
    return loaded
  }

  /** Absent and another scope look the same to every operation but registration. */
  private domainOf(scope: StorageScope, transactionDomain: string): Domain | null {
    const domain = this.domains.get(transactionDomain)
    return domain !== undefined && scopeKey(domain.scope) === scopeKey(scope) ? domain : null
  }

  // --- registerCombination ----------------------------------------------------------------------

  registerCombination(input: CombinationRegistrationV2): Promise<RegisterResultV2> {
    const reject = (reason: RegisterRejectReason): Promise<RegisterResultV2> =>
      Promise.resolve({
        kind: 'rejected_before_accept',
        reason,
        diagnostic: this.diagnostic(reason),
      })
    if (this.closing) return reject('closing')
    const scope = decodeScope((input as Partial<CombinationRegistrationV2> | null)?.scope)
    const names: unknown = input?.participants
    const namesOk =
      Array.isArray(names) &&
      names.every(name => isName(name))
    if (
      scope === null ||
      !isName(input.transactionDomain, DOMAIN_BYTES) ||
      !isName(input.combinationVersion) ||
      !isDigest(input.manifestDigest) ||
      !namesOk
    )
      return reject('field_missing')
    const participants = names as string[]
    if (participants.length === 0) return reject('participant_empty')
    if (new Set(participants).size !== participants.length) return reject('participant_repeated')
    const judged = combinationManifest({ catalog: this.catalog, participants })
    if (judged.kind === 'material_unavailable') return reject('material_unavailable')
    if (judged.kind === 'combination_invalid') return reject('combination_invalid')
    if (manifestDigest(judged.manifest) !== input.manifestDigest) return reject('manifest_mismatch')
    const key = {
      scope,
      transactionDomain: input.transactionDomain,
      combinationVersion: input.combinationVersion,
    }
    return new Promise(resolve => {
      this.queue.submit({
        start: () => {
          resolve(this.register(scope, input, sortNames(participants)))
          return Promise.resolve()
        },
        withdraw: () =>
          resolve({ kind: 'unknown', key, diagnostic: this.diagnostic('withdrawn_before_start') }),
      })
    })
  }

  private register(
    scope: StorageScope,
    input: CombinationRegistrationV2,
    participants: string[],
  ): RegisterResultV2 {
    const domain = this.domains.get(input.transactionDomain)
    if (domain !== undefined && scopeKey(domain.scope) !== scopeKey(scope))
      return {
        kind: 'rejected_before_accept',
        reason: 'domain_occupied',
        diagnostic: this.diagnostic('domain_occupied'),
      }
    const registration: CombinationRegistrationV2 = {
      scope,
      transactionDomain: input.transactionDomain,
      combinationVersion: input.combinationVersion,
      manifestDigest: input.manifestDigest,
      participants,
    }
    const existing = domain?.registrations.get(input.combinationVersion)
    if (existing !== undefined) {
      const same =
        existing.registration.manifestDigest === registration.manifestDigest &&
        existing.registration.participants.join('\n') === participants.join('\n')
      if (!same)
        return {
          kind: 'rejected_before_accept',
          reason: 'registration_conflict',
          diagnostic: this.diagnostic('registration_conflict'),
        }
      return { kind: 'registered', registration: existing.registration }
    }
    const target: Domain = domain ?? { scope, registrations: new Map(), receipts: new Map() }
    target.registrations.set(input.combinationVersion, { registration })
    this.domains.set(input.transactionDomain, target)
    return { kind: 'registered', registration }
  }

  // --- commit ---------------------------------------------------------------------------------------

  commit(
    input: CommitRequestV2,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<CommitResultV2> {
    const signal = options?.signal
    const decoded = decodeIdentity((input as Partial<CommitRequestV2> | null)?.identity)
    const reject = (
      reason: CommitRejectReason,
      identity: SqlIdentity | null = decoded.identity,
    ): CommitResultV2 =>
      ({
        kind: 'rejected_before_accept',
        identity,
        reason,
        diagnostic: this.diagnostic(reason),
      }) as CommitResultV2
    const unknownOf = (text: string): CommitResultV2 => ({
      kind: 'unknown',
      identity: decoded.identity as SqlIdentity, // read only after the identity is decoded
      diagnostic: this.diagnostic(text),
    })
    const early = this.controlRejection(input, signal, reject, unknownOf)
    if (early !== null) return Promise.resolve(early)
    const identity = decoded.identity as SqlIdentity
    return new Promise(resolve => {
      let settled = false
      const settle = (result: CommitResultV2): void => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const unknown = unknownOf
      // Abort releases the observer only. The operation stays in the queue and runs to its end.
      const onAbort = (): void => settle(unknown('observer_detached'))
      signal?.addEventListener('abort', onAbort, { once: true })
      this.queue.submit({
        start: async () => settle(await this.execute(input, identity, reject)),
        withdraw: () => settle(unknown('withdrawn_before_start')),
      })
    })
  }

  /** Steps 1 to 7 of SPEC 7.2. They run on the control side and reserve nothing. */
  private controlRejection(
    input: CommitRequestV2,
    signal: AbortSignal | undefined,
    reject: (reason: CommitRejectReason) => CommitResultV2,
    unknown: (text: string) => CommitResultV2,
  ): CommitResultV2 | null {
    if (this.closing) return reject('closing')
    if (signal?.aborted === true) return reject('cancelled')
    const decoded = decodeIdentity((input as Partial<CommitRequestV2> | null)?.identity)
    const commands: unknown = input?.commands
    const commandsOk =
      Array.isArray(commands) &&
      commands.length > 0 &&
      commands.every(
        (command: unknown) =>
          typeof command === 'object' &&
          command !== null &&
          isName((command as { participant?: unknown }).participant) &&
          typeof (command as { facts?: unknown }).facts === 'object' &&
          (command as { facts?: unknown }).facts !== null &&
          !Array.isArray((command as { facts?: unknown }).facts),
      )
    if (
      decoded.fields === null ||
      !isName(input.combinationVersion) ||
      !isDigest(input.manifestDigest) ||
      !commandsOk
    )
      return reject('field_missing')
    if (decoded.protocol !== '2') return reject('unsupported_protocol')
    const list = commands as CommitRequestV2['commands'][number][]
    if (new Set(list.map(command => command.participant)).size !== list.length)
      return reject('participant_repeated')
    if (!list.every(command => isStrictJson(command.facts))) return reject('facts_not_json')
    // SPEC 7.2 has no reason for a request that is not JSON outside `facts`. A result still comes
    // through the return value (SPEC 2.5 rule 1), and it is `unknown`, which reserves nothing.
    if (!isStrictJson(input)) return unknown('request_not_json')
    if (!this.withinLimits(input, list)) return reject('command_limit')
    return null
  }

  private withinLimits(
    input: CommitRequestV2,
    list: CommitRequestV2['commands'][number][],
  ): boolean {
    const { limits } = this
    if (list.length > limits.maxCommandsPerCommit) return false
    if (utf8Length(canonicalJson(input)) > limits.maxRequestBytes) return false
    let members = 0
    for (const command of list) {
      if (utf8Length(canonicalJson(command)) > limits.maxCommandBytes) return false
      const shape = jsonShape(command.facts)
      if (shape.depth > limits.maxJsonDepth) return false
      members += shape.members
    }
    return members <= limits.maxJsonMembers
  }

  /** Steps 9 to 15 of SPEC 7.2, then recognition, then execution. */
  private async execute(
    input: CommitRequestV2,
    identity: SqlIdentity,
    reject: (reason: CommitRejectReason, identity?: SqlIdentity | null) => CommitResultV2,
  ): Promise<CommitResultV2> {
    const domain = this.domainOf(identity.scope, identity.transactionDomain)
    const registered = domain?.registrations.get(input.combinationVersion)
    if (domain === null || registered === undefined) return reject('combination_unregistered')
    if (registered.registration.manifestDigest !== input.manifestDigest)
      return reject('manifest_mismatch')
    const members = new Set(registered.registration.participants)
    const named = input.commands.map(command => command.participant)
    if (!named.every(name => members.has(name))) return reject('participant_not_in_combination')
    if (this.dependencyMissing(named, [...members])) return reject('participant_dependency_missing')

    const inputDigest = inputDigestV2(input)
    const existing = domain.receipts.get(receiptKey(identity))
    if (existing !== undefined)
      return existing.inputDigest === inputDigest
        ? existing
        : { kind: 'identity_conflict', identity, existing }

    const entries: (ParticipatedEntry | StoppingEntry)[] = []
    const facts = new Map<string, JsonValue>()
    const byName = new Map(input.commands.map(command => [command.participant, command.facts]))
    let responseBytes = 0
    for (const name of this.executionOrder(named)) {
      const descriptor = this.descriptors.get(name) as ParticipantDescriptor
      const outcome = await this.runParticipant(descriptor, byName.get(name) ?? {}, facts)
      let reply = outcome.reply
      if (reply.kind !== 'failed') {
        const text = canonicalJson(reply.kind === 'participated' ? reply.response : reply.basis)
        responseBytes += utf8Length(text)
        if (
          utf8Length(text) > this.limits.maxResponseBytes ||
          responseBytes > this.limits.maxOperationResponseBytes
        )
          reply = {
            kind: 'failed',
            category: 'response_limit',
            diagnostic: this.diagnostic('response_limit'),
          }
      }
      if (reply.kind === 'participated' && outcome.kind === 'participated') {
        for (const [id, value] of outcome.provided) facts.set(id, value)
        entries.push({ participant: name, protocol: descriptor.protocol, reply })
        continue
      }
      entries.push({ participant: name, protocol: descriptor.protocol, reply } as StoppingEntry)
      const receipt = {
        kind: 'rolled_back',
        identity,
        inputDigest,
        combinationVersion: input.combinationVersion,
        manifestDigest: input.manifestDigest,
        responses: entries,
      } as unknown as ReceiptV2 // entries end with the stopping entry, by the branch above
      domain.receipts.set(receiptKey(identity), receipt)
      return receipt
    }
    const receipt = {
      kind: 'committed',
      identity,
      inputDigest,
      combinationVersion: input.combinationVersion,
      manifestDigest: input.manifestDigest,
      responses: entries,
    } as unknown as ReceiptV2 // the loop reached its end, so every entry participated
    domain.receipts.set(receiptKey(identity), receipt)
    return receipt
  }

  /** A commanded participant needs a fact whose provider is not commanded (SPEC 7.2 step 15). */
  private dependencyMissing(named: readonly string[], combination: readonly string[]): boolean {
    const providers = new Map<string, string>()
    for (const name of combination)
      for (const fact of this.descriptors.get(name)?.providesFacts ?? [])
        providers.set(factId(fact), name)
    return named.some(name =>
      (this.descriptors.get(name)?.requiresFacts ?? []).some(fact => {
        const provider = providers.get(factId(fact))
        return provider !== undefined && !named.includes(provider)
      }),
    )
  }

  /** Topological order over the facts, ties broken by name in UTF-16 code units (SPEC 7.5). */
  private executionOrder(named: readonly string[]): string[] {
    const providers = new Map<string, string>()
    for (const name of named)
      for (const fact of this.descriptors.get(name)?.providesFacts ?? [])
        providers.set(factId(fact), name)
    const order: string[] = []
    const remaining = new Set(named)
    while (remaining.size > 0) {
      const ready = sortNames([...remaining]).filter(name =>
        (this.descriptors.get(name)?.requiresFacts ?? []).every(fact => {
          const provider = providers.get(factId(fact))
          return provider === undefined || provider === name || !remaining.has(provider)
        }),
      )
      const next = ready[0]
      if (next === undefined) throw new Error('fact dependency cycle in a registered combination')
      order.push(next)
      remaining.delete(next)
    }
    return order
  }

  private async runParticipant(
    descriptor: ParticipantDescriptor,
    facts: Readonly<Record<string, JsonValue>>,
    cell: ReadonlyMap<string, JsonValue>,
  ): Promise<Outcome> {
    const failed = (category: FailureCategory, text: string = category): Outcome => ({
      kind: 'stopped',
      reply: { kind: 'failed', category, diagnostic: this.diagnostic(text) },
    })
    let module: ParticipantModule
    try {
      module = ((await this.load(descriptor.moduleUrl)) as { default: ParticipantModule }).default
    } catch {
      return failed('participant_threw')
    }
    const port = new FactPort(descriptor, cell)
    let reply: unknown
    try {
      reply = module.execute(structuredClone(facts), port)
    } catch {
      port.close()
      return failed(port.violation ?? 'participant_threw')
    }
    port.close()
    if (port.violation !== null) return failed(port.violation)
    return this.judgeReply(reply, port, failed)
  }

  private judgeReply(
    reply: unknown,
    port: FactPort,
    failed: (category: FailureCategory, text?: string) => Outcome,
  ): Outcome {
    if (typeof reply !== 'object' || reply === null) return failed('invalid_reply')
    const record = reply as Record<string, unknown>
    switch (record['kind']) {
      case 'participated':
        return 'response' in record && isStrictJson(record['response'])
          ? {
              kind: 'participated',
              reply: { kind: 'participated', response: record['response'] },
              provided: port.provided,
            }
          : failed('invalid_reply')
      case 'conflict':
      case 'unsupported':
        return 'basis' in record && isStrictJson(record['basis'])
          ? { kind: 'stopped', reply: { kind: record['kind'], basis: record['basis'] } }
          : failed('invalid_reply')
      case 'failed':
        return typeof record['diagnostic'] === 'string'
          ? failed('participant_reported', record['diagnostic'])
          : failed('invalid_reply')
      default:
        return failed('invalid_reply')
    }
  }

  // --- query ----------------------------------------------------------------------------------------

  query(identity: SqlIdentity): Promise<QueryResultV2> {
    const decoded = decodeIdentity(identity)
    const unknown = (text: string): QueryResultV2 => ({
      kind: 'unknown',
      identity,
      diagnostic: this.diagnostic(text),
    })
    if (this.closing) return Promise.resolve(unknown('closing'))
    if (decoded.identity === null) return Promise.resolve(unknown('invalid_identity'))
    const valid = decoded.identity
    return new Promise(resolve => {
      this.queue.submit({
        start: () => {
          const domain = this.domainOf(valid.scope, valid.transactionDomain)
          if (domain === null) resolve(unknown('domain_unavailable'))
          else
            resolve(
              domain.receipts.get(receiptKey(valid)) ?? {
                kind: 'not_committed',
                identity: valid,
                proofs: {
                  writerGenerationExcluded: true,
                  oldTransactionTerminated: true,
                  databaseRecoveryFinished: true,
                  authoritativeReadSucceeded: true,
                  operationNotQueued: true,
                },
              },
            )
          return Promise.resolve()
        },
        withdraw: () => resolve(unknown('withdrawn_before_start')),
      })
    })
  }

  // --- read -----------------------------------------------------------------------------------------

  async read(
    input: ReadRequest,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<ReadResult> {
    const raw = input as Partial<ReadRequest> | null
    const requestKey = isName(raw?.requestKey) ? raw.requestKey : null
    const unavailable = (reason: string, text: string = reason): ReadResult =>
      ({
        kind: 'unavailable',
        requestKey,
        reason,
        diagnostic: this.diagnostic(text),
      }) as ReadResult
    if (this.closing) return unavailable('closing')
    if (options?.signal?.aborted === true) return { kind: 'cancelled', requestKey }
    const scope = decodeScope(raw?.domain?.scope)
    if (
      requestKey === null ||
      scope === null ||
      !isName(raw?.domain?.transactionDomain, DOMAIN_BYTES) ||
      !isName(raw.handler) ||
      !isName(raw.protocol) ||
      !('input' in raw) ||
      !isStrictJson(raw.input)
    )
      return unavailable('invalid')
    const shape = jsonShape(raw.input)
    if (
      utf8Length(canonicalJson(raw.input)) > this.limits.maxReadInputBytes ||
      shape.depth > this.limits.maxJsonDepth ||
      shape.members > this.limits.maxJsonMembers
    )
      return unavailable('read_limit')
    const handler = this.catalog.readHandlers.find(
      item => item.handler === raw.handler && item.protocol === raw.protocol,
    )
    if (handler === undefined) return unavailable('handler_unavailable')
    const domain = this.domainOf(scope, raw.domain.transactionDomain)
    if (domain === null) return unavailable('domain_unavailable')
    if (!this.migrationsPresent(domain, handler.requiresMigrations))
      return unavailable('schema_unavailable')
    const outcome = await this.runHandler(handler.moduleUrl, raw.input)
    if (outcome.kind !== 'read') return unavailable('read_failed')
    if (utf8Length(canonicalJson(outcome.output)) > handler.maxOutputBytes)
      return unavailable('read_limit')
    return { kind: 'read', requestKey, output: outcome.output }
  }

  /** The double treats a migration as present when a registered combination of the domain has it. */
  private migrationsPresent(
    domain: Domain,
    required: readonly Readonly<{ owner: string; id: string }>[],
  ): boolean {
    const present = new Set<string>()
    for (const { registration } of domain.registrations.values()) {
      const judged = combinationManifest({
        catalog: this.catalog,
        participants: registration.participants,
      })
      if (judged.kind === 'manifest')
        for (const item of judged.manifest.migrations)
          present.add(JSON.stringify([item.owner, item.id]))
    }
    return required.every(item => present.has(JSON.stringify([item.owner, item.id])))
  }

  private async runHandler(moduleUrl: string, input: JsonValue): Promise<HandlerOutcome> {
    const failed: HandlerOutcome = { kind: 'failed', diagnostic: 'read_failed' }
    try {
      const module = ((await this.load(moduleUrl)) as { default: ReadHandlerModule }).default
      const outcome: unknown = module.read(structuredClone(input), {
        execute: () => {
          throw new Error('the memory double has no SQL')
        },
      })
      if (typeof outcome !== 'object' || outcome === null) return failed
      const record = outcome as Record<string, unknown>
      return record['kind'] === 'read' && isStrictJson(record['output'])
        ? { kind: 'read', output: record['output'] }
        : failed
    } catch {
      return failed
    }
  }
}

/**
 * Creates the memory double. Like the provider factory, it checks the static materials once and
 * rejects when a digest does not match, a file cannot be read, or a declared combination is invalid.
 */
export async function createMemorySqlStorage(
  input: MemorySqlStorageInput,
): Promise<Readonly<{ storage: SqlStorage; control: StorageControl }>> {
  await verifyMaterials(input.materials)
  const storage = new MemorySqlStorage(input.materials, { ...DEFAULT_LIMITS, ...input.limits })
  const control: StorageControl = {
    async close() {
      storage.closing = true
      storage.queue.withdrawWaiting()
      await storage.queue.whenIdle()
      return { kind: 'closed' }
    },
    assemblyReportSettled() {},
  }
  return { storage, control }
}
