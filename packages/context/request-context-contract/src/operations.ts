import { tenantEquals } from '@omne-harness/legal-identity'
import type { ContextTarget, PrincipalKey, SourceGeneration } from './refs.js'
import type { AssemblyOperations, AssemblyPolicies } from './ports.js'
import type { ContextSources, PrincipalBinding } from './sources.js'
import type { AssemblyCall, AssemblyFailure, AssemblyResult, AssemblyUnknown } from './values.js'
import type { OperationContext } from './operation-context.js'
import { readInputs, sourceFailure } from './input-read.js'
import { preparationKey } from './preparation.js'
import { assembleInputs } from './assembly.js'
import { resumeInputs } from './resume.js'
import type { AssemblyReuse } from './reuse.js'

type Failure = AssemblyFailure | AssemblyUnknown
export type AssemblyOperationsInput<P> = Readonly<{
  target: ContextTarget
  sources: ContextSources<P>
  principalBinding: PrincipalBinding<P>
  policies: AssemblyPolicies
  generation?: SourceGeneration | null
  reuse?: AssemblyReuse
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

async function publish<P, R>(
  call: AssemblyCall<P>,
  input: AssemblyOperationsInput<P>,
  result: R | Failure,
): Promise<R | Failure> {
  const refused = await eligible(call, input)
  return refused ?? result
}

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
    derive: (
      read: Extract<Awaited<ReturnType<typeof readInputs<P>>>, { kind: 'inputs' }>,
      principal: PrincipalKey,
    ) => Promise<R>,
  ): Promise<R | Failure> => {
    const begun = await begin(call, input)
    if (begun.kind !== 'begun') return begun
    // Only after the call was admitted: the cache answers no question about who may read.
    const cached =
      input.reuse?.load({
        principal: begun.principal,
        purpose: call.purpose,
        position: call.position,
      }) ?? null
    const read = await readInputs(call, input.target, input.sources, {
      principal: begun.principal,
      generation: input.generation ?? null,
      cached,
    })
    if (read.kind !== 'inputs') return read
    return publish(call, input, await derive(read, begun.principal))
  }
  return {
    assemble: (call): Promise<AssemblyResult> =>
      run(call, (read, principal) =>
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
          { historyRead: read.historyRead, reuse: input.reuse },
        ),
      ),
    resume: (call): Promise<AssemblyResult> =>
      run(call, (read, principal) =>
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
          { historyRead: read.historyRead, reuse: input.reuse },
        ),
      ),
  }
}
