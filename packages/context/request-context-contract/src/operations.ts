// The stateless operation group (RQ-12, RQ-13): every call checks access and eligibility, reads
// the groups stably, derives, and checks eligibility again before it publishes the result.
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ContextTarget, PrincipalKey, SourceGeneration } from './refs.js'
import type { AssemblyOperations, AssemblyPolicies } from './ports.js'
import type { ContextSources, PrincipalBinding } from './sources.js'
import type {
  AssemblyCall,
  AssemblyFailure,
  AssemblyResult,
  AssemblyUnknown,
  DeriveInput,
  PlanResult,
  StepResult,
} from './values.js'
import type { OperationContext } from './operation-context.js'
import { readInputs, readModelGroup, sourceFailure } from './input-read.js'
import { preparationKey } from './preparation.js'
import { assembleInputs } from './assembly.js'
import { planInputs } from './plan.js'
import { deriveFrom } from './compaction-step.js'
import { resumeInputs } from './resume.js'

type Failure = AssemblyFailure | AssemblyUnknown
export type AssemblyOperationsInput<P> = Readonly<{
  target: ContextTarget
  sources: ContextSources<P>
  principalBinding: PrincipalBinding<P>
  policies: AssemblyPolicies
  /** The source set generation when a registry binds the group; part of `PreparedInputKey`. */
  generation?: SourceGeneration | null
}>

async function eligible<P>(
  call: AssemblyCall<P>,
  input: AssemblyOperationsInput<P>,
): Promise<Failure | null> {
  const decision = await input.sources.eligibility.check({
    access: call.access,
    target: input.target,
    operation: 'assembly',
  })
  switch (decision.kind) {
    case 'allowed':
      return null
    case 'denied':
      return { kind: 'denied', action: 'assemble', diagnostic: 'Read eligibility refused' }
    case 'unknown':
      return { kind: 'unknown', source: 'read', diagnostic: 'Read eligibility unknown' }
    case 'unavailable':
      return { kind: 'unavailable', owner: 'read-eligibility', diagnostic: decision.diagnostic }
  }
}

/** Access shape, tenant of the target, eligibility and principal key, before any source read. */
async function begin<P>(
  call: AssemblyCall<P>,
  input: AssemblyOperationsInput<P>,
): Promise<Readonly<{ kind: 'begun'; principal: PrincipalKey }> | Failure> {
  if (
    call === null ||
    typeof call !== 'object' ||
    call.access === null ||
    call.access === undefined
  )
    return { kind: 'invalid', field: 'access', reason: 'missing-access' }
  if (!tenantEquals(call.access.tenant, input.target.tenant))
    return {
      kind: 'denied',
      action: 'assemble',
      diagnostic: 'Access tenant is not the target tenant',
    }
  const refused = await eligible(call, input)
  if (refused !== null) return refused
  const key = await input.principalBinding.key(call.access)
  if (key.kind === 'value') return { kind: 'begun', principal: key.value }
  const failure = sourceFailure(key, 'principal')
  return failure.kind === 'unavailable' ? { ...failure, owner: 'principal-binding' } : failure
}

/** The last eligibility observation before the result leaves the operation. */
async function publish<P, R>(
  call: AssemblyCall<P>,
  input: AssemblyOperationsInput<P>,
  result: R | Failure,
): Promise<R | Failure> {
  const refused = await eligible(call, input)
  return refused ?? result
}

/** Binds a source set of one target; no Cordis, registry or production store is needed. */
export function createAssemblyOperations<P>(
  input: AssemblyOperationsInput<P>,
): AssemblyOperations<P> {
  const contextOf = (call: AssemblyCall<P>): OperationContext<P> => ({
    access: call.access,
    target: input.target,
    sources: input.sources,
    policies: input.policies,
  })
  const run = async <R>(
    call: AssemblyCall<P>,
    window: boolean,
    derive: (
      read: Extract<Awaited<ReturnType<typeof readInputs<P>>>, { kind: 'inputs' }>,
      principal: PrincipalKey,
    ) => Promise<R>,
  ): Promise<R | Failure> => {
    const begun = await begin(call, input)
    if (begun.kind !== 'begun') return begun
    const read = await readInputs(call, input.target, input.sources, {
      window,
      principal: begun.principal,
      generation: input.generation ?? null,
    })
    if (read.kind !== 'inputs') return read
    return publish(call, input, await derive(read, begun.principal))
  }
  return {
    assemble: (call): Promise<AssemblyResult> =>
      run(call, false, (read, principal) =>
        assembleInputs(
          read.input,
          preparationKey(
            read.input,
            principal,
            read.tokens,
            input.policies,
            input.generation ?? null,
          ),
          read.rows,
          contextOf(call),
        ),
      ),
    resume: (call): Promise<AssemblyResult> =>
      run(call, false, (read, principal) =>
        resumeInputs(
          read.input,
          preparationKey(
            read.input,
            principal,
            read.tokens,
            input.policies,
            input.generation ?? null,
          ),
          read.rows,
          contextOf(call),
        ),
      ),
    planCompaction: (call): Promise<PlanResult> =>
      run(call, true, async read =>
        read.window === null
          ? { kind: 'invalid', field: 'history.compactionContext', reason: 'missing-input' }
          : planInputs(read.input, read.rows, read.window, contextOf(call)),
      ),
    deriveStep: async (derive: DeriveInput<P>): Promise<StepResult> => {
      const call = derive?.call
      const begun = await begin(call, input)
      if (begun.kind !== 'begun') return begun
      const model = await readModelGroup(call, input.sources)
      if (model.kind !== 'stable') return model
      return publish(call, input, await deriveFrom(derive, model.value, contextOf(call)))
    },
  }
}
