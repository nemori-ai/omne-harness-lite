// The Cordis service definitions of Agent: abstract Services, the service keys, the
// `agent-cordis-contract/instance-retired` event and the instance directory. Provider plugins live
// in `@omne-harness/agent-host-local/cordis`. This entry does not import an Agent implementation.
import { type Context, Service } from '@deepseek-ai/cordis'
import type {
  ActionAdmission,
  AgentAccessCheck,
  AgentAdoptions,
  AgentClock,
  AgentExecutionRecovery,
  AgentInstanceHost,
  AgentInstanceId,
  AgentJournal,
  AgentMaterials,
  CurrentConditions,
  DecisionCards,
  ExtensionImplementations,
  MessageHandoff,
  ModelContextReader,
  ModelSelection,
  RegisteredReads,
  RequestPreparation,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type { AgentLocalRoute, AgentPublicationAuthority } from './index.ts'

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
