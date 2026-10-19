// The Cordis service definitions of Agent: abstract Services, the service keys, the
// `agent-cordis-contract/instance-retired` event and the instance directory. Provider plugins live
// in `@omne-harness/agent-host-local/cordis`. This entry does not import an Agent implementation.
import { randomBytes } from 'node:crypto'
import { type Context, Service } from '@deepseek-ai/cordis'
import {
  decodeAgentRegistrationId,
  type ActionAdmission,
  type AgentAccessCheck,
  type AgentAccessOperation,
  type AgentAdoptions,
  type AgentClock,
  type AgentDirectory,
  type AgentExecutionRecovery,
  type AgentInstanceHost,
  type AgentInstanceId,
  type AgentJournal,
  type AgentMaterials,
  type AgentRegistrationId,
  type CurrentConditions,
  type DecisionCards,
  type ExtensionImplementations,
  type Failure,
  type MessageHandoff,
  type ModelContextReader,
  type ModelSelection,
  type RegisteredReads,
  type Registration,
  type RegistrationState,
  type RequestPreparation,
  type Reply,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  AgentLocalRoute,
  AgentPublicationAuthority,
  AgentRegistrationInput,
  AgentWithdrawalInput,
} from './index.ts'

export type {
  AgentLocalRoute,
  AgentPublicationAuthority,
  AgentRegistrationInput,
  AgentWithdrawalInput,
} from './index.ts'

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentJournalService<P> extends Service implements AgentJournal<P> {
  static readonly provide = 'agentJournal'
  constructor(ctx: Context) {
    super(ctx, AgentJournalService.provide)
  }
  abstract readonly open: AgentJournal<P>['open']
  abstract readonly attach: AgentJournal<P>['attach']
  abstract readonly detach: AgentJournal<P>['detach']
  abstract readonly commit: AgentJournal<P>['commit']
  abstract readonly submit: AgentJournal<P>['submit']
  abstract readonly control: AgentJournal<P>['control']
  abstract readonly acknowledge: AgentJournal<P>['acknowledge']
  abstract readonly recordResult: AgentJournal<P>['recordResult']
  abstract readonly recordControl: AgentJournal<P>['recordControl']
  abstract readonly tryFinish: AgentJournal<P>['tryFinish']
  abstract readonly recordTerminalObservation: AgentJournal<P>['recordTerminalObservation']
  abstract readonly load: AgentJournal<P>['load']
  abstract readonly inputs: AgentJournal<P>['inputs']
  abstract readonly readReplyAdmissions: AgentJournal<P>['readReplyAdmissions']
  abstract readonly query: AgentJournal<P>['query']
  abstract readonly output: AgentJournal<P>['output']
  abstract readonly capabilities: AgentJournal<P>['capabilities']
}
export const agentJournalKey = AgentJournalService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentAccessCheckService<P> extends Service implements AgentAccessCheck<P> {
  static readonly provide = 'agentAccessCheck'
  constructor(ctx: Context) {
    super(ctx, AgentAccessCheckService.provide)
  }
  abstract readonly check: AgentAccessCheck<P>['check']
}
export const agentAccessCheckKey = AgentAccessCheckService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class ModelSelectionService<P> extends Service implements ModelSelection<P> {
  static readonly provide = 'agentModelSelection'
  constructor(ctx: Context) {
    super(ctx, ModelSelectionService.provide)
  }
  abstract readonly select: ModelSelection<P>['select']
}
export const agentModelSelectionKey = ModelSelectionService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class ModelContextReaderService<P>
  extends Service
  implements ModelContextReader<P>
{
  static readonly provide = 'agentModelContext'
  constructor(ctx: Context) {
    super(ctx, ModelContextReaderService.provide)
  }
  abstract readonly read: ModelContextReader<P>['read']
}
export const agentModelContextKey = ModelContextReaderService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class ActionAdmissionService<P> extends Service implements ActionAdmission<P> {
  static readonly provide = 'agentActionAdmission'
  constructor(ctx: Context) {
    super(ctx, ActionAdmissionService.provide)
  }
  abstract readonly admit: ActionAdmission<P>['admit']
}
export const agentActionAdmissionKey = ActionAdmissionService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class DecisionCardsService<P> extends Service implements DecisionCards<P> {
  static readonly provide = 'agentDecisionCards'
  constructor(ctx: Context) {
    super(ctx, DecisionCardsService.provide)
  }
  abstract readonly present: DecisionCards<P>['present']
  abstract readonly lookup: DecisionCards<P>['lookup']
  abstract readonly read: DecisionCards<P>['read']
  abstract readonly invalidate: DecisionCards<P>['invalidate']
}
export const agentDecisionCardsKey = DecisionCardsService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class MessageHandoffService<P> extends Service implements MessageHandoff<P> {
  static readonly provide = 'agentMessageHandoff'
  constructor(ctx: Context) {
    super(ctx, MessageHandoffService.provide)
  }
  abstract readonly accept: MessageHandoff<P>['accept']
}
export const agentMessageHandoffKey = MessageHandoffService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class ExtensionImplementationsService<P>
  extends Service
  implements ExtensionImplementations<P>
{
  static readonly provide = 'agentExtensions'
  constructor(ctx: Context) {
    super(ctx, ExtensionImplementationsService.provide)
  }
  abstract readonly resolve: ExtensionImplementations<P>['resolve']
}
export const agentExtensionsKey = ExtensionImplementationsService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentAdoptionsService<P> extends Service implements AgentAdoptions<P> {
  static readonly provide = 'agentAdoptions'
  constructor(ctx: Context) {
    super(ctx, AgentAdoptionsService.provide)
  }
  abstract readonly resolve: AgentAdoptions<P>['resolve']
  abstract readonly handover: AgentAdoptions<P>['handover']
}
export const agentAdoptionsKey = AgentAdoptionsService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class CurrentConditionsService<P> extends Service implements CurrentConditions<P> {
  static readonly provide = 'agentConditions'
  constructor(ctx: Context) {
    super(ctx, CurrentConditionsService.provide)
  }
  abstract readonly read: CurrentConditions<P>['read']
}
export const agentConditionsKey = CurrentConditionsService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class RequestPreparationService<P>
  extends Service
  implements RequestPreparation<P>
{
  static readonly provide = 'agentRequests'
  constructor(ctx: Context) {
    super(ctx, RequestPreparationService.provide)
  }
  abstract readonly prepare: RequestPreparation<P>['prepare']
  abstract readonly derive: RequestPreparation<P>['derive']
  abstract readonly resume: RequestPreparation<P>['resume']
}
export const agentRequestsKey = RequestPreparationService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentMaterialsService<P, B extends ContentBlock>
  extends Service
  implements AgentMaterials<P, B>
{
  static readonly provide = 'agentMaterials'
  constructor(ctx: Context) {
    super(ctx, AgentMaterialsService.provide)
  }
  abstract readonly preserve: AgentMaterials<P, B>['preserve']
  abstract readonly read: AgentMaterials<P, B>['read']
}
export const agentMaterialsKey = AgentMaterialsService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class RegisteredReadsService<P> extends Service implements RegisteredReads<P> {
  static readonly provide = 'agentReads'
  constructor(ctx: Context) {
    super(ctx, RegisteredReadsService.provide)
  }
  abstract readonly read: RegisteredReads<P>['read']
  abstract readonly lookup: RegisteredReads<P>['lookup']
}
export const agentReadsKey = RegisteredReadsService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentClockService extends Service implements AgentClock {
  static readonly provide = 'agentClock'
  constructor(ctx: Context) {
    super(ctx, AgentClockService.provide)
  }
  abstract readonly waitUntil: AgentClock['waitUntil']
}
export const agentClockKey = AgentClockService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentInstanceHostService<P> extends Service implements AgentInstanceHost<P> {
  static readonly provide = 'agentInstanceHost'
  constructor(ctx: Context) {
    super(ctx, AgentInstanceHostService.provide)
  }
  abstract readonly reserve: AgentInstanceHost<P>['reserve']
  abstract readonly publish: AgentInstanceHost<P>['publish']
  abstract readonly withdraw: AgentInstanceHost<P>['withdraw']
  abstract readonly directory: AgentInstanceHost<P>['directory']
  /** In-process only. The directory asks the host for the objects of a published instance. */
  abstract route(tenant: TenantId, instance: AgentInstanceId): AgentLocalRoute<P> | null
}
export const agentInstanceHostKey = AgentInstanceHostService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentPublicationAuthorityService<P>
  extends Service
  implements AgentPublicationAuthority<P>
{
  static readonly provide = 'agentPublicationAuthority'
  constructor(ctx: Context) {
    super(ctx, AgentPublicationAuthorityService.provide)
  }
  abstract readonly check: AgentPublicationAuthority<P>['check']
}
export const agentPublicationAuthorityKey = AgentPublicationAuthorityService.provide

/** @owner packages/agent/agent-cordis-contract */
export abstract class AgentExecutionRecoveryService<P>
  extends Service
  implements AgentExecutionRecovery<P>
{
  static readonly provide = 'agentExecutionRecovery'
  constructor(ctx: Context) {
    super(ctx, AgentExecutionRecoveryService.provide)
  }
  abstract readonly query: AgentExecutionRecovery<P>['query']
  abstract readonly load: AgentExecutionRecovery<P>['load']
  abstract readonly reconcile: AgentExecutionRecovery<P>['reconcile']
  abstract readonly detach: AgentExecutionRecovery<P>['detach']
}
export const agentExecutionRecoveryKey = AgentExecutionRecoveryService.provide

type RetirementReason = 'withdrawn' | 'contributor-removed' | 'superseded'

// One registration, from its entry to the end of the process. The directory keeps ended records so
// that a late call of an old identity, and a repeated call of an old operation, still find their
// answer. `hint` is the reason that the next removal reports: only an explicit withdrawal sets it.
type Entry = {
  readonly id: AgentRegistrationId
  readonly tenant: TenantId
  readonly instance: AgentInstanceId
  readonly instanceKey: string
  readonly generation: number
  readonly fiber: Context['fiber']
  readonly inputText: string
  readonly drop: () => unknown
  state: RegistrationState
  hint: RetirementReason | undefined
  announced: Promise<void> | undefined
}

type Admission =
  | Readonly<{ kind: 'refused'; failure: Failure }>
  | Readonly<{ kind: 'recognised'; registration: Registration }>
  | Readonly<{ kind: 'entered'; record: Entry; superseded: Entry | undefined }>

type Reached =
  | Readonly<{ kind: 'route'; route: AgentLocalRoute<unknown> }>
  | Readonly<{ kind: 'no-live-route' }>

const owner = 'agentInstances'

const unavailable = (source: string, diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: source,
  diagnostic,
})

// A caller can hand over anything, so reading it can throw. A read that throws is an invalid input.
function guarded<T>(read: () => T): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

// The text of the data that a retry has to repeat. Members come in sorted order, so two inputs that
// hold the same data give the same text. It is undefined when the data cannot be written as JSON.
function dataText(value: unknown): string | undefined {
  return guarded(() =>
    JSON.stringify(value, (_name, member: unknown) =>
      typeof member === 'object' && member !== null && !Array.isArray(member)
        ? Object.fromEntries(
            Object.entries(member).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          )
        : member,
    ),
  )
}

// One entry per tenant and instance. Equal tenants give equal text, and the text never contains
// the raw separator of the pair, so two pairs cannot collide. A tenant that did not come from the
// identity parser has no text and so no key.
function keyOf(tenant: TenantId, member: string): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok && typeof member === 'string' && member !== ''
    ? JSON.stringify([text.value, member])
    : undefined
}

type EntryKeys = Readonly<{ instance: string; operation: string; text: string }>

// What `register` repeats on a retry: the keys of the instance and of the operation, and the text
// of the data. It throws when the caller handed over something that has no such members.
function keysOf<P>(input: AgentRegistrationInput<P>): EntryKeys | undefined {
  const instance = keyOf(input.tenant, input.instance)
  const operation = keyOf(input.tenant, input.operation)
  const text = dataText([input.principal, input.instance, input.scope, input.state])
  return instance === undefined || operation === undefined || text === undefined
    ? undefined
    : { instance, operation, text }
}

function mintRegistration(): AgentRegistrationId | undefined {
  const decoded = decodeAgentRegistrationId(randomBytes(16).toString('hex'))
  return 'ok' in decoded ? decoded.ok : undefined
}

function createDirectory<P>(ctx: Context, authority: AgentPublicationAuthority<P>) {
  const records = new Map<string, Entry>()
  const live = new Map<string, Entry>()
  const operations = new Map<string, Entry>()
  const generations = new Map<string, number>()

  const view = (record: Entry): Registration => ({
    registration: record.id,
    state: record.state,
  })

  // Step: notify. The tell comes after the removal is whole, so a listener that calls back into
  // the directory sees the state after the removal. A listener failure is logged and changes
  // nothing that the directory has answered.
  function announce(record: Entry, reason: RetirementReason): Promise<void> {
    record.announced = (async () => {
      try {
        await ctx.parallel(
          'agent-cordis-contract/instance-retired',
          record.tenant,
          record.instance,
          record.generation,
          reason,
        )
      } catch (error) {
        const failures = error instanceof AggregateError ? error.errors.length : 1
        ctx
          .logger('agent-cordis-contract')
          .error(
            `${failures} listener(s) of instance-retired failed (${reason}, generation ${record.generation})`,
          )
      }
    })()
    return record.announced
  }

  // The one removal. Explicit withdrawal, supersession and the unload of the calling fiber all
  // reach it, and the first one wins. It returns the reason that it reported, or undefined when
  // the registration had already ended. It only changes the tables and never yields. An entry that
  // has not ended holds its instance in `live`, because a successor ends the old entry in the same
  // step that it enters, so this delete never removes a successor.
  function retire(record: Entry, reason: RetirementReason): RetirementReason | undefined {
    if (record.state === 'withdrawn') return undefined
    live.delete(record.instanceKey)
    record.state = 'withdrawn'
    return reason
  }

  // Takes the effect of an entry off its fiber. The removal that this runs is the one above, and
  // it has already happened when the entry is superseded. A failure of the disposer is logged.
  async function release(entry: Entry): Promise<void> {
    try {
      await entry.drop()
    } catch {
      ctx.logger('agent-cordis-contract').error('the effect of a registration did not end cleanly')
    }
  }

  // The removal for the fiber that ended: it announces on its own and nobody waits for it.
  function removeWithFiber(record: Entry): void {
    const reason = retire(record, record.hint ?? 'contributor-removed')
    if (reason !== undefined) void announce(record, reason)
  }

  // Step: check. The host's authority answers before anything is written. A throw from the
  // authority, or an answer of another shape, counts as unavailable and never as allowed.
  function check(
    input: AgentRegistrationInput<P> | AgentWithdrawalInput<P>,
    caller: Context,
  ): Failure | undefined {
    try {
      const checked = authority.check(input, caller)
      if ('ok' in checked) return undefined
      if ('failure' in checked) return checked.failure
    } catch {
      // The authority failed. The answer below is the same as for an answer of another shape.
    }
    return unavailable('agentPublicationAuthority', 'the publication authority gave no answer')
  }

  // Step: write. It runs inside the effect of the calling fiber and never yields: the authority
  // is asked, the keys are checked and the entry replaces the old one in one step, so the answer
  // cannot go stale in between.
  function admit(
    caller: Context,
    input: AgentRegistrationInput<P>,
    keys: EntryKeys,
    drop: () => unknown,
  ): Admission {
    const refused = check(input, caller)
    if (refused !== undefined) return { kind: 'refused', failure: refused }
    const held = operations.get(keys.operation)
    if (held !== undefined)
      return held.fiber === caller.fiber && held.inputText === keys.text
        ? { kind: 'recognised', registration: view(held) }
        : { kind: 'refused', failure: { kind: 'conflict', operation: input.operation } }
    const id = mintRegistration()
    if (id === undefined)
      return {
        kind: 'refused',
        failure: unavailable(owner, 'no registration identity could be made'),
      }
    const generation = (generations.get(keys.instance) ?? 0) + 1
    const record: Entry = {
      id,
      tenant: input.tenant,
      instance: input.instance,
      instanceKey: keys.instance,
      generation,
      fiber: caller.fiber,
      inputText: keys.text,
      drop,
      state: 'published',
      hint: undefined,
      announced: undefined,
    }
    const superseded = live.get(keys.instance)
    if (superseded !== undefined) retire(superseded, 'superseded')
    generations.set(keys.instance, generation)
    live.set(keys.instance, record)
    records.set(id, record)
    operations.set(keys.operation, record)
    return { kind: 'entered', record, superseded }
  }

  // Runs `admit` in an effect of the calling fiber, so the entry ends when that fiber ends. A
  // refused or recognised request registers nothing, so its effect is removed again at once.
  function enter(caller: Context, input: AgentRegistrationInput<P>, keys: EntryKeys): Admission {
    const call: { admission?: Admission; remove?: () => unknown } = {}
    const drop = () => call.remove?.()
    call.remove = caller.effect(() => {
      const admission = admit(caller, input, keys, drop)
      call.admission = admission
      return admission.kind === 'entered'
        ? () => removeWithFiber(admission.record)
        : () => undefined
    })
    const { admission } = call
    if (admission === undefined)
      return { kind: 'refused', failure: unavailable(owner, 'the registration effect did not run') }
    if (admission.kind !== 'entered') drop()
    return admission
  }

  async function register(caller: Context, input: AgentRegistrationInput<P>): Reply<Registration> {
    const keys = guarded(() => keysOf(input))
    if (keys === undefined)
      return fail({
        kind: 'invalid',
        field: 'input',
        reason: 'tenant, instance, operation or data is not valid',
      })
    let admission: Admission
    try {
      admission = enter(caller, input, keys)
    } catch {
      return fail(unavailable(owner, 'the calling fiber has ended'))
    }
    if (admission.kind === 'refused') return fail(admission.failure)
    if (admission.kind === 'recognised') return succeed(admission.registration)
    const { record, superseded } = admission
    if (superseded !== undefined) {
      await release(superseded)
      await announce(superseded, 'superseded')
    }
    return succeed(view(record))
  }

  async function withdraw(caller: Context, input: AgentWithdrawalInput<P>): Reply<Registration> {
    const instance = guarded(() => keyOf(input.tenant, input.instance))
    if (instance === undefined)
      return fail({ kind: 'invalid', field: 'input', reason: 'tenant or instance is not valid' })
    const refused = check(input, caller)
    if (refused !== undefined) return fail(refused)
    const record = records.get(input.registration)
    if (record === undefined || record.instanceKey !== instance)
      return fail({ kind: 'denied', action: 'withdraw' })
    if (record.state !== 'withdrawn') {
      record.state = 'withdrawing'
      record.hint = 'withdrawn'
      await release(record)
    }
    await record.announced
    return succeed(view(record))
  }

  // Step: check. The access check of the authorization domain answers before the directory looks
  // at its tables.
  async function qualify(
    input: Parameters<AgentDirectory<P>['resolve']>[0],
    operation: Extract<AgentAccessOperation, 'resolve' | 'connect'>,
  ): Promise<Failure | undefined> {
    const accessCheck = ctx.get('agentAccessCheck')
    if (accessCheck === undefined)
      return unavailable('agentAccessCheck', 'no access check is provided')
    try {
      const decision = await accessCheck.check({
        access: { principal: input.principal, tenant: input.tenant },
        operation,
        target: { kind: 'instance', instance: input.instance },
      })
      if (decision.kind === 'allowed') return undefined
      if (decision.kind === 'denied') return { kind: 'denied', action: operation }
      if (decision.kind === 'unavailable')
        return unavailable('agentAccessCheck', decision.diagnostic)
    } catch {
      // The access check failed. The answer below is the same as for an answer of another shape.
    }
    return unavailable('agentAccessCheck', 'the access check gave no answer')
  }

  // Asks the host for the objects of a published instance. The host is taken from the context at
  // each call, so a host that was replaced is never used from an old reference.
  function route(tenant: TenantId, instance: AgentInstanceId): Outcome<Reached, Failure> {
    const host = ctx.get('agentInstanceHost')
    if (host === undefined)
      return fail(unavailable('agentInstanceHost', 'no host provides the instance route'))
    try {
      const local = host.route(tenant, instance)
      return succeed(local === null ? { kind: 'no-live-route' } : { kind: 'route', route: local })
    } catch {
      return fail(unavailable('agentInstanceHost', 'the host failed to give the instance route'))
    }
  }

  // The path that resolve and connect share. An instance of another tenant has no entry under
  // this tenant's key, so it answers denied, the same as an instance that does not exist.
  async function reach(
    input: Parameters<AgentDirectory<P>['resolve']>[0],
    operation: Extract<AgentAccessOperation, 'resolve' | 'connect'>,
  ): Promise<Outcome<Reached, Failure>> {
    const key = guarded(() => keyOf(input.tenant, input.instance))
    if (key === undefined)
      return fail({ kind: 'invalid', field: 'input', reason: 'tenant or instance is not valid' })
    const refused = await qualify(input, operation)
    if (refused !== undefined) return fail(refused)
    const record = live.get(key)
    if (record === undefined) return fail({ kind: 'denied', action: operation })
    if (record.state !== 'published') return succeed({ kind: 'no-live-route' })
    return route(input.tenant, input.instance)
  }

  return {
    register,
    withdraw,
    async resolve(input: Parameters<AgentDirectory<P>['resolve']>[0]) {
      const reached = await reach(input, 'resolve')
      if ('failure' in reached) return reached
      return reached.ok.kind === 'route'
        ? succeed(reached.ok.route.runtime)
        : fail(unavailable(owner, 'the instance has no live route'))
    },
    async connect(input: Parameters<AgentDirectory<P>['connect']>[0]) {
      const reached = await reach(input, 'connect')
      if ('failure' in reached) return reached
      return succeed(
        reached.ok.kind === 'route'
          ? ({ kind: 'live', handle: reached.ok.route.observation } as const)
          : ({ kind: 'no-live-route' } as const),
      )
    },
  }
}

/**
 * The directory of Agent instances. The host that runs an instance registers it for one tenant and
 * instance through `register`, and `resolve` and `connect` serve the objects that the host
 * gives for it. The state stays in the closure built by the constructor and not on the instance,
 * because every property of the instance is reachable by any plugin that can read
 * `ctx.agentInstances`. `register` and `withdraw` are plain functions so that Cordis binds
 * `this.ctx` to the calling plugin: a registration then ends with the fiber of the caller.
 * @owner packages/agent/agent-cordis-contract
 */
export class AgentInstancesService<P> extends Service implements AgentDirectory<P> {
  static readonly provide = 'agentInstances'

  readonly resolve: AgentDirectory<P>['resolve']
  readonly connect: AgentDirectory<P>['connect']
  readonly register: (input: AgentRegistrationInput<P>) => Reply<Registration>
  readonly withdraw: (input: AgentWithdrawalInput<P>) => Reply<Registration>

  constructor(ctx: Context, authority: AgentPublicationAuthority<P>) {
    super(ctx, AgentInstancesService.provide)
    const directory = createDirectory(ctx, authority)
    this.resolve = input => directory.resolve(input)
    this.connect = input => directory.connect(input)
    this.register = function (this: AgentInstancesService<P> | undefined, input) {
      return this === undefined
        ? Promise.resolve(fail(unavailable(owner, 'register was called without its service')))
        : directory.register(this.ctx, input)
    }
    this.withdraw = function (this: AgentInstancesService<P> | undefined, input) {
      return this === undefined
        ? Promise.resolve(fail(unavailable(owner, 'withdraw was called without its service')))
        : directory.withdraw(this.ctx, input)
    }
  }
}
export const agentInstancesKey = AgentInstancesService.provide

const emptyConfig = {
  '~standard': {
    version: 1 as const,
    vendor: 'agent-cordis-contract',
    validate(value: unknown) {
      if (value === undefined || value === null) return { value: {} }
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
        return { value: {} }
      return { issues: [{ message: 'configuration accepts no fields' }] }
    },
  },
}

/**
 * The plugin of the directory: it provides `agentInstances` once the publication authority and
 * the access check are present, and it loads again when either one changes its provider. Its
 * `Config` is an empty object and refuses any member.
 */
export const agentInstancesPlugin = {
  name: 'agentInstances',
  Config: emptyConfig,
  inject: ['agentPublicationAuthority', 'agentAccessCheck'],
  apply(ctx: Context) {
    new AgentInstancesService(ctx, ctx.agentPublicationAuthority)
  },
}

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still
  // check every input at run time.
  interface Context {
    agentJournal: AgentJournalService<unknown>
    agentAccessCheck: AgentAccessCheckService<unknown>
    agentModelSelection: ModelSelectionService<unknown>
    agentModelContext: ModelContextReaderService<unknown>
    agentActionAdmission: ActionAdmissionService<unknown>
    agentDecisionCards: DecisionCardsService<unknown>
    agentMessageHandoff: MessageHandoffService<unknown>
    agentExtensions: ExtensionImplementationsService<unknown>
    agentAdoptions: AgentAdoptionsService<unknown>
    agentConditions: CurrentConditionsService<unknown>
    agentRequests: RequestPreparationService<unknown>
    agentMaterials: AgentMaterialsService<unknown, ContentBlock>
    agentReads: RegisteredReadsService<unknown>
    agentClock: AgentClockService
    agentInstanceHost: AgentInstanceHostService<unknown>
    agentPublicationAuthority: AgentPublicationAuthorityService<unknown>
    agentExecutionRecovery: AgentExecutionRecoveryService<unknown>
    agentInstances: AgentInstancesService<unknown>
  }
  interface Events {
    /**
     * One registration of an Agent instance was removed. The payload has identities only.
     * It does not mean that an execution ended. The sender catches listener failures.
     *
     * @mode parallel
     * @param tenant - the tenant that owns the instance.
     * @param instance - the instance whose registration was removed.
     * @param generation - the publication generation of the removed registration.
     * @param reason - withdrawn, contributor-removed or superseded.
     */
    'agent-cordis-contract/instance-retired'(
      tenant: TenantId,
      instance: AgentInstanceId,
      generation: number,
      reason: 'withdrawn' | 'contributor-removed' | 'superseded',
    ): void
  }
}
