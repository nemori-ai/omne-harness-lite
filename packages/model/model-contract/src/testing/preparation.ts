// The request preparation double: a `ModelRequestPreparation<P>` that binds a profile by a plan the
// test gives and forms each request from the assembled input of that call. A plan fixes only the
// bound suppliers and the adopted parameters; the messages, tools and every other assembled field
// come from the call, so a compressed input reaches the transport as it was assembled. The double
// expands replay with the real judge and prepares the injected transport, then awaits the close of
// what it prepared. It does not measure, read media, fetch secrets, run parameter rules or send.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { decodeCredentialId } from '../credential-values.ts'
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

/** The input fields a plan is looked up by: no message, tool or assembled source takes part. */
export type ScriptedModelPreparationMatch<P> = Access<P> &
  Readonly<{
    profile: ModelProfile
    required: ModalityRequirement
    parameters: AssembledModelInput['parameters']
  }>

/** How the profile is bound: the suppliers with their credentials, and the adopted parameters. */
export type ScriptedModelPreparationPlan = Readonly<{
  suppliers: FixedModelRequest['suppliers']
  parameterAdoptions: FixedModelRequest['parameterAdoptions']
}>

/** One call of the business port, recorded with a snapshot of its input when it arrived. */
export type ScriptedModelPreparationCall<P> = Readonly<{
  sequence: number
  input: Parameters<ModelRequestPreparation<P>['prepare']>[0]
}>

export type ScriptedModelRequestPreparationOptions = Readonly<{
  /** The transport that each successful plan prepares and closes once. */
  transport: ModelTransport
}>

export type ScriptedModelRequestPreparation<P> = Readonly<{
  /** The business port. It carries none of the controls below. */
  preparation: ModelRequestPreparation<P>
  /** The test control plane; an access that was never set is denied. */
  setAccess(access: Access<P>, decision: ScriptedAccessDecision): void
  /** The plan for a call with exactly this match; a second set replaces it. */
  setPlan(
    input: ScriptedModelPreparationMatch<P>,
    answer: Outcome<ScriptedModelPreparationPlan, ModelFailure>,
  ): void
  /** Every business call so far, in arrival order, as a new frozen array. */
  calls(): readonly ScriptedModelPreparationCall<P>[]
}>

type PlanKey = Readonly<{
  profile: ModelProfile
  required: ModalityRequirement
  parameters: AssembledModelInput['parameters']
}>

type PrepareInput<P> = Parameters<ModelRequestPreparation<P>['prepare']>[0]

type Declarations = FixedModelRequest['declarations']

/** Why a profile cannot serve a preparation: the business failure and the misuse of a plan. */
type ProfileRefusal = Readonly<{ failure: ModelFailure; misuse: string }>

const SUPPLIER_FIELDS: readonly string[] = ['adoption', 'credential', 'model', 'recipient']

/**
 * Step 5 of the read order, and the only judgment of whether a profile can serve this preparation:
 * its scope applies to the tenant, it is active and it covers the requirement. A business call
 * returns the failure; a plan registration throws the misuse.
 */
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
  if (credential === undefined) throw misuse('a planned supplier needs its credential')
  const { kind } = credential
  if (kind !== 'tenant' && kind !== 'factory')
    throw misuse('a planned credential is neither a tenant nor a factory binding')
  if (Object.keys(credential).length !== (kind === 'tenant' ? 2 : 1))
    throw misuse('a planned credential does not have exactly the fields of its kind')
  if (kind === 'tenant' && !('ok' in decodeCredentialId(credential.id)))
    throw misuse('a planned tenant credential id does not decode')
}

/** A planned supplier is the profile supplier at its position with a credential added. */
function checkSupplier(supplier: Supplier, own: ProfileSupplier): void {
  if (Object.keys(supplier).some(field => !SUPPLIER_FIELDS.includes(field)))
    throw misuse(
      'a planned supplier has a field other than adoption, recipient, model and credential',
    )
  if (!sameValue(supplier.adoption, own.adoption))
    throw misuse(
      'a planned supplier has another adoption than the profile supplier at its position',
    )
  if (supplier.recipient !== own.recipient)
    throw misuse(
      'a planned supplier has another recipient than the profile supplier at its position',
    )
  if (supplier.model !== own.model)
    throw misuse('a planned supplier has another model than the profile supplier at its position')
  checkCredential(supplier.credential)
}

/** The plan binds the suppliers of the profile one to one, in the order of the profile. */
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

/** Each adoption belongs to a planned supplier, and an explicit one names an asked parameter. */
function checkAdoptions(plan: ScriptedModelPreparationPlan, parameters: PlanKey['parameters']) {
  for (const adoption of plan.parameterAdoptions) {
    if (!plan.suppliers.some(supplier => sameValue(supplier.adoption, adoption.supplier)))
      throw misuse('a parameter adoption names a supplier outside the plan')
    const { origin } = adoption
    if (origin.kind === 'explicit' && !parameters.some(item => sameValue(item, origin.requested)))
      throw misuse('an explicit adoption names a parameter that the input does not ask for')
  }
}

/** Every asked parameter has an explicit adoption for every planned supplier. */
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

/**
 * A successful plan needs a profile that can serve the match. It binds the suppliers of the
 * profile one to one, in order, and adds only the credential to each. Each adopted parameter
 * belongs to a planned supplier, an explicit adoption names a parameter of the match, and every
 * parameter of the match has an explicit adoption for every supplier. Defaults and conversions are
 * what the script says; nothing here runs rules.
 */
function checkPlan<P>(match: ScriptedModelPreparationMatch<P>, plan: ScriptedModelPreparationPlan) {
  const refused = profileFailure(match)
  if (refused !== null) throw misuse(refused.misuse)
  checkSuppliers(plan.suppliers, match.profile.definition.suppliers)
  checkAdoptions(plan, match.parameters)
  checkExplicitCoverage(plan, match.parameters)
}

/** The replay declarations of the profile suppliers, in order, by the real judge. */
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

/** The request of this call: the plan binds, the assembled input of this call fills the rest. */
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

  /** Steps 2 to 5 of the read order: the tenant, the control plane, then the profile. */
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
      // A rejection of the close is the rejection of this call: the close is not retried and the
      // request is not handed out. A close does not take back what the transport did.
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
