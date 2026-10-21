// Compile-time checks of the `./cordis` augmentation and of the root types. Each
// `@ts-expect-error` names the diagnostic that the accepted types must produce.
import type { Context, Events } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentClock,
  AgentInstanceHost,
  AgentInstanceId,
  AgentRegistrationId,
  Failure,
  Registration,
  Reply,
} from '@omne-harness/agent-contract'
import type {
  AgentLocalRoute,
  AgentRegistrationInput,
  AgentWithdrawalInput,
} from '@omne-harness/agent-cordis-contract'
import {
  agentAccessCheckKey,
  agentInstancesKey,
  agentMaterialsKey,
  type AgentAccessCheckService,
  type AgentClockService,
  type AgentInstanceHostService,
  type AgentInstancesService,
  type AgentJournalService,
  type AgentMaterialsService,
  type AgentPublicationAuthority,
  type AgentPublicationAuthorityService,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { expectTypeOf, it } from 'vitest'

declare const ctx: Context
declare const tenant: TenantId
declare const instance: AgentInstanceId
declare const execution: AgentExecutionId
declare const registration: AgentRegistrationId

it('types the injected Agent services on the context, with the principal left open', () => {
  expectTypeOf(ctx.agentJournal).toEqualTypeOf<AgentJournalService<unknown>>()
  expectTypeOf(ctx.agentAccessCheck).toEqualTypeOf<AgentAccessCheckService<unknown>>()
  expectTypeOf(ctx.agentClock).toEqualTypeOf<AgentClockService>()
  expectTypeOf(ctx.agentClock.now).toEqualTypeOf<AgentClock['now']>()
  expectTypeOf(ctx.agentInstanceHost).toEqualTypeOf<AgentInstanceHostService<unknown>>()
  expectTypeOf(ctx.agentInstances).toEqualTypeOf<AgentInstancesService<unknown>>()
  expectTypeOf(ctx.agentPublicationAuthority).toEqualTypeOf<
    AgentPublicationAuthorityService<unknown>
  >()
  expectTypeOf(ctx.agentMaterials).toEqualTypeOf<AgentMaterialsService<unknown, ContentBlock>>()
})

it('gives each key constant the literal of its service name', () => {
  expectTypeOf<typeof agentAccessCheckKey>().toEqualTypeOf<'agentAccessCheck'>()
  expectTypeOf<typeof agentInstancesKey>().toEqualTypeOf<'agentInstances'>()
  expectTypeOf<typeof agentMaterialsKey>().toEqualTypeOf<'agentMaterials'>()
})

it('carries tenant, instance, generation and reason on agent-cordis-contract/instance-retired', () => {
  expectTypeOf<Parameters<Events['agent-cordis-contract/instance-retired']>>().toEqualTypeOf<
    [
      tenant: TenantId,
      instance: AgentInstanceId,
      generation: number,
      reason: 'withdrawn' | 'contributor-removed' | 'superseded',
    ]
  >()
  void ctx.parallel('agent-cordis-contract/instance-retired', tenant, instance, 1, 'superseded')
  // @ts-expect-error TS2769: No overload matches, because 'AgentExecutionId' is not assignable to parameter 'instance' of type 'AgentInstanceId'.
  void ctx.parallel('agent-cordis-contract/instance-retired', tenant, execution, 1, 'withdrawn')
  // @ts-expect-error TS2769: No overload matches, because '"closed"' is not one of the three reasons.
  void ctx.parallel('agent-cordis-contract/instance-retired', tenant, instance, 1, 'closed')
})

it('takes the registration and withdrawal inputs from the host operations', () => {
  expectTypeOf<AgentRegistrationInput<string>>().toEqualTypeOf<
    Parameters<AgentInstanceHost<string>['publish']>[0]
  >()
  expectTypeOf<AgentWithdrawalInput<string>>().toEqualTypeOf<
    Parameters<AgentInstanceHost<string>['withdraw']>[0]
  >()
  expectTypeOf<AgentWithdrawalInput<string>['registration']>().toEqualTypeOf<AgentRegistrationId>()
  void registration
})

it('answers register and withdraw with a Registration, and the authority with an outcome', () => {
  expectTypeOf<ReturnType<AgentInstancesService<string>['register']>>().toEqualTypeOf<
    Reply<Registration>
  >()
  expectTypeOf<ReturnType<AgentInstancesService<string>['withdraw']>>().toEqualTypeOf<
    Reply<Registration>
  >()
  expectTypeOf<ReturnType<AgentPublicationAuthority<string>['check']>>().toEqualTypeOf<
    Outcome<void, Failure>
  >()
  expectTypeOf<Parameters<AgentPublicationAuthority<string>['check']>[1]>().toEqualTypeOf<Context>()
})

it('hands the in-process route to the directory as the runtime and the observation of one instance', () => {
  expectTypeOf<
    ReturnType<AgentInstanceHostService<string>['route']>
  >().toEqualTypeOf<AgentLocalRoute<string> | null>()
  expectTypeOf<Parameters<AgentInstanceHostService<string>['route']>>().toEqualTypeOf<
    [tenant: TenantId, instance: AgentInstanceId]
  >()
})
