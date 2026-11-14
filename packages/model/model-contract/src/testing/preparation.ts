import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import type { ModelFailure } from '../result.ts'
import type { FixedModelRequest, Supplier } from '../root.ts'
import type {
  AssembledModelInput,
  ModalityRequirement,
  ModelProfile,
  ModelRequestPreparation,
  ProfileSupplier,
  ReplayDeclaration,
} from '../profile.ts'
import type { ModelTransport } from '../provider-protocol.ts'
import { judgeReplayDeclaration } from '../replay-values.ts'
import { createAccessRules, type ScriptedAccessDecision } from './access.ts'
import { misuse } from './error.ts'
import {
  copyProfile,
  covers,
  findRow,
  frozenAnswer,
  profileScopeFailure,
  putRow,
  refusal,
  type ScriptRow,
} from './profile-values.ts'
import { frozenCopy, sameValue, tenantText } from './values.ts'

export type ScriptedModelPreparationMatch<P> = Access<P> &
  Readonly<{
    profile: ModelProfile
    required: ModalityRequirement
    parameters: AssembledModelInput['parameters']
  }>

export type ScriptedModelPreparationPlan = Readonly<{
  suppliers: FixedModelRequest['suppliers']
  parameterAdoptions: FixedModelRequest['parameterAdoptions']
}>

export type ScriptedModelPreparationCall<P> = Readonly<{
  sequence: number
  input: Parameters<ModelRequestPreparation<P>['prepare']>[0]
}>

export type ScriptedModelRequestPreparationOptions = Readonly<{
  transport: ModelTransport
}>

export type ScriptedModelRequestPreparation<P> = Readonly<{
  preparation: ModelRequestPreparation<P>
  setAccess(access: Access<P>, decision: ScriptedAccessDecision): void
  setPlan(
    input: ScriptedModelPreparationMatch<P>,
    answer: Outcome<ScriptedModelPreparationPlan, ModelFailure>,
  ): void
  calls(): readonly ScriptedModelPreparationCall<P>[]
}>

type PlanKey = Readonly<{
  profile: ModelProfile
  required: ModalityRequirement
  parameters: AssembledModelInput['parameters']
}>

type PrepareInput<P> = Parameters<ModelRequestPreparation<P>['prepare']>[0]

type Declarations = FixedModelRequest['declarations']

type ProfileRefusal = Readonly<{ failure: ModelFailure; misuse: string }>

const SUPPLIER_FIELDS: readonly string[] = ['adoption', 'credential', 'model', 'provider']

function profileFailure(
  input: Pick<PrepareInput<unknown>, 'tenant' | 'profile' | 'required'>,
): ProfileRefusal | null {
  const scope = profileScopeFailure(input.profile.identity.scope, input.tenant)
  if (scope === 'invalid-identity')
    return {
      failure: { kind: 'invalid', field: 'profile.identity.scope', reason: 'invalid-identity' },
      misuse: 'the planned profile scope holds an identity that is not minted',
    }
  if (scope === 'foreign')
    return {
      failure: { kind: 'denied', action: 'prepare' },
      misuse: 'the planned profile scope does not apply to the tenant',
    }
  if (input.profile.availability === 'withdrawn')
    return {
      failure: { kind: 'invalid', field: 'profile', reason: 'withdrawn' },
      misuse: 'a planned profile must be active',
    }
  if (!covers(input.profile, input.required))
    return {
      failure: { kind: 'invalid', field: 'required.modalities', reason: 'modality' },
      misuse: 'the planned profile does not cover the input',
    }
  return null
}

function checkCredential(credential: Supplier['credential'] | undefined): void {
  if (credential === undefined) throw misuse('a planned supplier needs its credential layer')
  const { layer } = credential
  if (layer !== 'tenant' && layer !== 'official' && layer !== 'none')
    throw misuse('a planned credential layer is neither tenant, official nor none')
  if (Object.keys(credential).length !== 1)
    throw misuse('a planned credential layer has a field other than layer')
}

function checkSupplier(supplier: Supplier, own: ProfileSupplier): void {
  if (Object.keys(supplier).some(field => !SUPPLIER_FIELDS.includes(field)))
    throw misuse(
      'a planned supplier has a field other than adoption, provider, model and credential',
    )
  if (!sameValue(supplier.adoption, own.adoption))
    throw misuse(
      'a planned supplier has another adoption than the profile supplier at its position',
    )
  if (supplier.provider !== own.provider)
    throw misuse(
      'a planned supplier has another provider than the profile supplier at its position',
    )
  if (supplier.model !== own.model)
    throw misuse('a planned supplier has another model than the profile supplier at its position')
  checkCredential(supplier.credential)
}

function checkSuppliers(planned: readonly Supplier[], listed: readonly ProfileSupplier[]): void {
  const count = Math.max(planned.length, listed.length)
  for (let index = 0; index < count; index += 1) {
    const supplier = planned[index]
    const own = listed[index]
    if (supplier === undefined || own === undefined)
      throw misuse('the plan must bind every supplier of the profile')
    checkSupplier(supplier, own)
  }
}

function checkAdoptions(plan: ScriptedModelPreparationPlan, parameters: PlanKey['parameters']) {
  for (const adoption of plan.parameterAdoptions) {
    if (!plan.suppliers.some(supplier => sameValue(supplier.adoption, adoption.supplier)))
      throw misuse('a parameter adoption names a supplier outside the plan')
    const { origin } = adoption
    if (origin.kind === 'explicit' && !parameters.some(item => sameValue(item, origin.requested)))
      throw misuse('an explicit adoption names a parameter that the input does not ask for')
  }
}

function checkExplicitCoverage(
  plan: ScriptedModelPreparationPlan,
  parameters: PlanKey['parameters'],
) {
  const adopted = (parameter: PlanKey['parameters'][number], supplier: Supplier) =>
    plan.parameterAdoptions.some(
      ({ origin, supplier: owner }) =>
        origin.kind === 'explicit' &&
        sameValue(origin.requested, parameter) &&
        sameValue(owner, supplier.adoption),
    )
  for (const parameter of parameters)
    if (!plan.suppliers.every(supplier => adopted(parameter, supplier)))
      throw misuse('an asked parameter has no explicit adoption for a supplier')
}

function checkPlan<P>(match: ScriptedModelPreparationMatch<P>, plan: ScriptedModelPreparationPlan) {
  const refused = profileFailure(match)
  if (refused !== null) throw misuse(refused.misuse)
  checkSuppliers(plan.suppliers, match.profile.definition.suppliers)
  checkAdoptions(plan, match.parameters)
  checkExplicitCoverage(plan, match.parameters)
}

function declare(
  suppliers: ModelProfile['definition']['suppliers'],
): Outcome<Declarations, ModelFailure> {
  const [head, ...rest] = suppliers
  const first = judgeReplayDeclaration(head, 0)
  if (!('ok' in first)) return Object.freeze(fail(frozenCopy(first.failure)))
  const more: ReplayDeclaration[] = []
  for (const [offset, supplier] of rest.entries()) {
    const declared = judgeReplayDeclaration(supplier, offset + 1)
    if (!('ok' in declared)) return Object.freeze(fail(frozenCopy(declared.failure)))
    more.push(declared.ok)
  }
  const declarations: Declarations = Object.freeze([first.ok, ...more])
  return succeed(declarations)
}

function formRequest(
  input: PrepareInput<unknown>,
  plan: ScriptedModelPreparationPlan,
  declarations: Declarations,
): FixedModelRequest {
  const { profile, assembled } = input
  return Object.freeze({
    profile: profile.adoption,
    suppliers: plan.suppliers,
    fallback: profile.definition.fallback,
    retryPolicy: profile.definition.retryPolicy,
    parameters: assembled.parameters,
    system: assembled.system,
    messages: assembled.messages,
    tools: assembled.tools,
    toolChoice: assembled.toolChoice,
    ...(assembled.replay === 'off' && { replay: 'off' as const }),
    declarations,
    representation: assembled.representation,
    parameterAdoptions: plan.parameterAdoptions,
    source: assembled.source,
  })
}

export function createScriptedModelRequestPreparation<P>(
  options: ScriptedModelRequestPreparationOptions,
): ScriptedModelRequestPreparation<P> {
  const { transport } = options
  const rules = createAccessRules<P>()
  const plans: ScriptRow<P, PlanKey, ScriptedModelPreparationPlan>[] = []
  const recorded: ScriptedModelPreparationCall<P>[] = []

  function qualify(input: PrepareInput<P>): ModelFailure | null {
    if (!tenantCodec.encode(input.tenant).ok) return { kind: 'denied', action: 'tenant' }
    const decision = rules.decide(input)
    if (decision === 'deny') return { kind: 'denied', action: 'prepare' }
    if (decision === 'unavailable')
      return {
        kind: 'unavailable',
        dependency: 'model-request-preparation',
        diagnostic: 'scripted-access',
      }
    const profile = profileFailure(input)
    return profile === null ? null : profile.failure
  }

  const preparation: ModelRequestPreparation<P> = {
    async prepare(input) {
      const snapshot: PrepareInput<P> = Object.freeze({
        tenant: input.tenant,
        principal: input.principal,
        profile: copyProfile(input.profile),
        required: frozenCopy(input.required),
        assembled: frozenCopy(input.assembled),
      })
      recorded.push(Object.freeze({ sequence: recorded.length + 1, input: snapshot }))
      const refused = qualify(snapshot)
      if (refused !== null) return refusal(refused)
      const row = findRow(plans, snapshot, {
        profile: snapshot.profile,
        required: snapshot.required,
        parameters: snapshot.assembled.parameters,
      })
      if (row === undefined) throw misuse('no scripted preparation plan')
      if (!('ok' in row.answer)) return row.answer
      const declarations = declare(snapshot.profile.definition.suppliers)
      if (!('ok' in declarations)) return declarations
      const request = formRequest(snapshot, row.answer.ok, declarations.ok)
      const prepared = await transport.prepare(
        request,
        request.suppliers[0],
        Object.freeze({ resent: Object.freeze([]) }),
      )
      if (!('ok' in prepared)) return Object.freeze(fail(frozenCopy(prepared.failure)))
      await prepared.ok.close()
      return Object.freeze(succeed(request))
    },
  }

  return {
    preparation,
    setAccess: (access, decision) => rules.set(access, decision),
    setPlan(input, answer) {
      const tenant = tenantText(input.tenant)
      if ('ok' in answer) checkPlan(input, answer.ok)
      putRow(plans, {
        tenant,
        principal: input.principal,
        key: Object.freeze({
          profile: copyProfile(input.profile),
          required: frozenCopy(input.required),
          parameters: frozenCopy(input.parameters),
        }),
        answer: frozenAnswer(answer, frozenCopy),
      })
    },
    calls: () => Object.freeze([...recorded]),
  }
}
