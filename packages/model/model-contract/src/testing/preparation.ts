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
  ReplayDeclaration,
} from '../profile.ts'
import type { ModelTransport } from '../provider-protocol.ts'
import { judgeReplayDeclaration } from '../replay-values.ts'
import { createAccessRules, type ScriptedAccessDecision } from './access.ts'
import { misuse } from './error.ts'
import { copyProfile, profileScopeFailure } from './profile-values.ts'
import { frozenCopy, sameValue, tenantText } from './values.ts'

/** The input fields a plan is looked up by: no message, tool or source takes part. */
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

type PlanRow<P> = Readonly<{
  tenant: string
  principal: P
  profile: ModelProfile
  required: ModalityRequirement
  parameters: AssembledModelInput['parameters']
  answer: Outcome<ScriptedModelPreparationPlan, ModelFailure>
}>

type PrepareInput<P> = Parameters<ModelRequestPreparation<P>['prepare']>[0]

const SUPPLIER_FIELDS = ['adoption', 'credential', 'model', 'recipient'].join()

function covers(profile: ModelProfile, required: ModalityRequirement): boolean {
  const input: readonly string[] = profile.definition.input
  return required.modalities.every(modality => input.includes(modality))
}

function checkCredential(credential: Supplier['credential'] | undefined): void {
  if (credential === undefined) throw misuse('a planned supplier needs its credential')
  if (credential.kind === 'factory' && Object.keys(credential).length === 1) return
  if (
    credential.kind === 'tenant' &&
    Object.keys(credential).length === 2 &&
    'ok' in decodeCredentialId(credential.id)
  )
    return
  throw misuse('a planned credential is not a credential binding')
}

/**
 * A successful plan binds the suppliers of the profile one to one, in order, and adds only the
 * credential to each. Each adopted parameter belongs to a planned supplier, an explicit adoption
 * names a parameter of the match, and every parameter of the match has an explicit adoption for
 * every supplier. Defaults and conversions are what the script says; nothing here runs rules.
 */
function checkPlan<P>(match: ScriptedModelPreparationMatch<P>, plan: ScriptedModelPreparationPlan) {
  const { profile, required, parameters } = match
  if (profileScopeFailure(profile.identity.scope, match.tenant) !== null)
    throw misuse('the planned profile scope does not apply to the tenant')
  if (profile.availability !== 'active') throw misuse('a planned profile must be active')
  if (!covers(profile, required)) throw misuse('the planned profile does not cover the input')
  const listed = profile.definition.suppliers
  if (plan.suppliers.length !== listed.length)
    throw misuse('the plan must bind every supplier of the profile')
  plan.suppliers.forEach((supplier, index) => {
    const own = listed[index]
    if (
      own === undefined ||
      Object.keys(supplier).sort().join() !== SUPPLIER_FIELDS ||
      !sameValue(supplier.adoption, own.adoption) ||
      supplier.recipient !== own.recipient ||
      supplier.model !== own.model
    )
      throw misuse('a planned supplier is not the supplier of the profile at its position')
    checkCredential(supplier.credential)
  })
  for (const adoption of plan.parameterAdoptions) {
    if (!plan.suppliers.some(supplier => sameValue(supplier.adoption, adoption.supplier)))
      throw misuse('a parameter adoption names a supplier outside the plan')
    const { origin } = adoption
    if (origin.kind === 'explicit' && !parameters.some(item => sameValue(item, origin.requested)))
      throw misuse('an explicit adoption names a parameter that the input does not ask for')
  }
  for (const parameter of parameters)
    for (const supplier of plan.suppliers)
      if (
        !plan.parameterAdoptions.some(
          adoption =>
            adoption.origin.kind === 'explicit' &&
            sameValue(adoption.origin.requested, parameter) &&
            sameValue(adoption.supplier, supplier.adoption),
        )
      )
        throw misuse('an asked parameter has no explicit adoption for a supplier')
}

function refusal(failure: ModelFailure): Outcome<never, ModelFailure> {
  return Object.freeze(fail(Object.freeze(failure)))
}

/** Step 5 of the read order: the static profile and requirement checks, before the plan. */
function profileFailure<P>(input: PrepareInput<P>): ModelFailure | null {
  const scope = profileScopeFailure(input.profile.identity.scope, input.tenant)
  if (scope === 'invalid-identity')
    return { kind: 'invalid', field: 'profile.identity.scope', reason: 'invalid-identity' }
  if (scope === 'foreign') return { kind: 'denied', action: 'prepare' }
  if (input.profile.availability === 'withdrawn')
    return { kind: 'invalid', field: 'profile', reason: 'withdrawn' }
  if (!covers(input.profile, input.required))
    return { kind: 'invalid', field: 'required.modalities', reason: 'modality' }
  return null
}

/** The request of this call: the plan binds, the assembled input of this call fills the rest. */
function formRequest(
  input: PrepareInput<unknown>,
  plan: ScriptedModelPreparationPlan,
  declarations: readonly [ReplayDeclaration, ...ReplayDeclaration[]],
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
  const plans: PlanRow<P>[] = []
  const recorded: ScriptedModelPreparationCall<P>[] = []

  function samePlanKey(row: PlanRow<P>, key: Omit<PlanRow<P>, 'answer'>): boolean {
    return (
      row.tenant === key.tenant &&
      Object.is(row.principal, key.principal) &&
      sameValue(row.profile, key.profile) &&
      sameValue(row.required, key.required) &&
      sameValue(row.parameters, key.parameters)
    )
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
      if (!tenantCodec.encode(snapshot.tenant).ok)
        return refusal({ kind: 'denied', action: 'tenant' })
      const decision = rules.decide(snapshot)
      if (decision === 'deny') return refusal({ kind: 'denied', action: 'prepare' })
      if (decision === 'unavailable')
        return refusal({
          kind: 'unavailable',
          dependency: 'model-request-preparation',
          diagnostic: 'scripted-access',
        })
      const refused = profileFailure(snapshot)
      if (refused !== null) return refusal(refused)
      const key = {
        tenant: tenantText(snapshot.tenant),
        principal: snapshot.principal,
        profile: snapshot.profile,
        required: snapshot.required,
        parameters: snapshot.assembled.parameters,
      }
      const row = plans.find(item => samePlanKey(item, key))
      if (row === undefined) throw misuse('no scripted preparation plan')
      if (!('ok' in row.answer)) return row.answer
      const declarations: ReplayDeclaration[] = []
      for (const [index, supplier] of snapshot.profile.definition.suppliers.entries()) {
        const declared = judgeReplayDeclaration(supplier, index)
        if (!('ok' in declared)) return Object.freeze(fail(frozenCopy(declared.failure)))
        declarations.push(declared.ok)
      }
      const [first, ...more] = declarations
      if (first === undefined) throw misuse('a profile has at least one supplier')
      const request = formRequest(snapshot, row.answer.ok, Object.freeze([first, ...more]))
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
      const row: PlanRow<P> = {
        tenant,
        principal: input.principal,
        profile: copyProfile(input.profile),
        required: frozenCopy(input.required),
        parameters: frozenCopy(input.parameters),
        answer: Object.freeze(
          'ok' in answer ? succeed(frozenCopy(answer.ok)) : fail(frozenCopy(answer.failure)),
        ),
      }
      const at = plans.findIndex(item => samePlanKey(item, row))
      if (at === -1) plans.push(Object.freeze(row))
      else plans[at] = Object.freeze(row)
    },
    calls: () => Object.freeze([...recorded]),
  }
}
