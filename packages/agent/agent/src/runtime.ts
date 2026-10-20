// createAgentRuntime: the creation checks of docs/public-api.md "createAgentRuntime 的幂等与失败",
// then the four faces. Every check reads the options or a dependency's properties only. A failed
// creation builds nothing, writes no Journal record, emits no event, and calls neither the
// registration handle nor access.check, so no caller can take the failure for a half-ready instance.
import type { ContentBlock } from '@omne-harness/content-block'
import type { Failure, Reply } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { accessGuard } from './access.ts'
import { judgeOptions } from './configuration.ts'
import type {
  AgentConfiguration,
  AgentDependencies,
  AgentProvider,
  AgentRuntimeOptions,
} from './construction.ts'
import { createProvider } from './provider.ts'

/**
 * The dependencies whose absence stops the creation (public-api "依赖逐项分类"). The six
 * locally required ones fail on their own path; registration is optional.
 */
const REQUIRED = [
  'journal',
  'access',
  'models',
  'adoptions',
  'conditions',
  'requests',
  'selection',
  'modelContext',
  'handoff',
  'clock',
] as const satisfies readonly (keyof AgentDependencies<unknown, ContentBlock>)[]

function isPresent(value: unknown): boolean {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}

/** `denied` when a registration handle is given for another instance than the binding names. */
function foreignRegistration<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  options: AgentRuntimeOptions,
): Failure | undefined {
  const { registration } = dependencies
  if (!isPresent(registration) || registration?.instance === options.binding.instance)
    return undefined
  return { kind: 'denied', action: 'createAgentRuntime' }
}

function absentDependency<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
): Failure | undefined {
  const absent = REQUIRED.find(name => !isPresent(dependencies[name]))
  if (absent === undefined) return undefined
  return {
    kind: 'unavailable',
    owner: '@omne-harness/agent',
    diagnostic: `required dependency ${absent} is absent`,
  }
}

/**
 * `unsupported` when the Journal provider declares no participant for one kind of `jointCommits`
 * (SPEC "提交参加者协议"). An independent assembly lists none and passes. 待 #558 M04-3: how an
 * external coordinator declares its participation is not decided, so the refusal of a coordinator
 * assembly is limited to the CallerCommit kinds that `capabilities.participants` can name.
 */
function undeclaredJointCommit<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  configuration: AgentConfiguration,
): Failure | undefined {
  const { participants } = dependencies.journal.capabilities
  return configuration.jointCommits.every(kind => participants.has(kind))
    ? undefined
    : { kind: 'unsupported' }
}

/**
 * Creates the runtime of one Agent instance; see docs/public-api.md. The checks run in this order,
 * those that read only the options before those that read a dependency:
 *
 * 1. configuration and binding fields: `invalid`;
 * 2. the instance of the registration handle against the binding: `denied`;
 * 3. the required dependencies: `unavailable`;
 * 4. `jointCommits` against the Journal's declared participants: `unsupported`.
 *
 * Two checks of public-api are not here, because nothing the factory receives can decide them
 * (see README_ZH.md "支持范围"). 待拥有者: whether the binding tenant matches the security scope
 * (`denied`); and whether the exact adoptions `binding.definition` and `loopGuardPolicy` resolve
 * (`unavailable`), which also decides through the definition whether tools, admission and
 * extensions are required.
 */
export async function createAgentRuntime<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  options: AgentRuntimeOptions,
): Reply<AgentProvider<P>> {
  const refusal =
    judgeOptions(options) ??
    foreignRegistration(dependencies, options) ??
    absentDependency(dependencies) ??
    undeclaredJointCommit(dependencies, options.configuration)
  if (refusal !== undefined) return fail(refusal)
  const { binding } = options
  return succeed(createProvider(binding.instance, accessGuard(binding.tenant, dependencies.access)))
}
