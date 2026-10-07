import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { instantFromRfc3339, instantToRfc3339 } from '@omne-harness-lite/offer-expiry'
import type {
  ToolRuntimeDependencies,
  ToolJournalHistory,
} from '@omne-harness-lite/tool-execution-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  ManagedResource,
  ResourceRecoveryResult,
} from '@omne-harness-lite/execution-environments'
import { createResultPreparation } from './execution-result.ts'
import { createTerminalCommitter } from './execution-terminal.ts'
import { jsonObject, sameJson } from './json-values.ts'
import type { createRuntimeJournal } from './runtime-journal.ts'

type Input = {
  readonly dependencies: Pick<
    ToolRuntimeDependencies,
    'backing' | 'owner' | 'recovery' | 'clock' | 'environments'
  >
  readonly journal: ReturnType<typeof createRuntimeJournal>
  readonly attempts: number
  readonly retry: (attempt: number) => Promise<void>
}
type Report = { readonly resource: ManagedResource } & ResourceRecoveryResult
const sameResource = (a: ManagedResource, b: ManagedResource) =>
  sameJson(a as unknown as JsonValue, b as unknown as JsonValue)

async function stopReceipt(input: Input, execution: ToolJournalHistory, report: Report) {
  const intent = execution.intent.value
  const scope = { tenant: intent.ref.tenant, session: intent.ref.session }
  const now = input.dependencies.clock.now()
  if (now === 'unavailable') throw new Error('Tool recovery clock unavailable')
  const status = report.status === 'confirmedStopped' ? 'confirmed' : 'unconfirmed'
  for (let attempt = 0; attempt < input.attempts; attempt++) {
    const current = await input.journal.read(scope, intent.ref.callId)
    if (current.kind !== 'view') break
    const observation = current.executions
      .get(intent.ref.callId)
      ?.resources.get(report.resource.key)
      ?.observations.at(-1)?.value
    if (
      observation?.status === status &&
      sameJson(observation.evidence ?? null, report.evidence ?? null)
    )
      return
    const committed = await input.journal.commit({
      ref: intent.ref,
      origin: intent.origin,
      expected: current.prefix,
      values: [
        {
          kind: 'physical_stop_observed',
          revision: 1,
          ref: intent.ref,
          key: report.resource.key,
          status,
          at: instantToRfc3339(now),
          ...(report.evidence === undefined ? {} : { evidence: report.evidence }),
        },
      ],
    })
    if (committed.kind === 'view') return
    if (committed.reason !== 'tailChanged') break
    await input.retry(attempt)
  }
  throw new Error('Tool runtime retains resource stop receipt')
}
function checkedReports(resources: readonly ManagedResource[], raw: unknown): readonly Report[] {
  const copied = copyJsonValue(raw)
  if ('failed' in copied || !Array.isArray(copied.ok) || copied.ok.length !== resources.length)
    throw new Error('Tool runtime retains resource recovery obligation')
  const reports = copied.ok as unknown as readonly Report[]
  for (let index = 0; index < resources.length; index++) {
    const report = reports[index]!
    if (
      !sameResource(report.resource, resources[index]!) ||
      !['confirmedStopped', 'pending', 'unsupported'].includes(report.status)
    )
      throw new Error('Tool recovery coordinates or response invalid')
  }
  return reports
}
async function recoverCallResources(input: Input, execution: ToolJournalHistory) {
  const intent = execution.intent.value
  const scope = { tenant: intent.ref.tenant, session: intent.ref.session }
  const resources = [...execution.resources.values()]
    .filter(
      resource => !resource.adopted && resource.observations.at(-1)?.value.status !== 'confirmed',
    )
    .map(resource => resource.planned.value.resource)
  const recovered = await input.dependencies.environments.recover(
    scope,
    input.dependencies.recovery,
    resources,
  )
  const reports = checkedReports(resources, recovered)
  for (const report of reports) await stopReceipt(input, execution, report)
  if (reports.some(report => report.status !== 'confirmedStopped'))
    throw new Error('Tool runtime retains unconfirmed resource cleanup')
}
async function finishInterruptedCall(input: Input, execution: ToolJournalHistory) {
  if (execution.terminal) return
  const intent = execution.intent.value,
    data = intent.input
  if (
    !jsonObject(data) ||
    data.format !== 'tool-input/1' ||
    typeof data.acceptedAt !== 'string' ||
    typeof data.pass !== 'string' ||
    data.chain === undefined ||
    !('ok' in instantFromRfc3339(data.acceptedAt))
  )
    throw new Error('Tool runtime recovery coordinates invalid')
  const prepared = await createResultPreparation({
    ref: intent.ref,
    chain: data.chain,
    pass: data.pass,
  })({ outcome: 'failed', code: 'abnormal_interruption' })
  if (prepared === 'unavailable') throw new Error('Tool runtime recovery basis unavailable')
  const result = await createTerminalCommitter({ ...input, clock: input.dependencies.clock })({
    ref: intent.ref,
    origin: intent.origin,
    ...prepared,
    startedAt: execution.started?.value.at ?? data.acceptedAt,
    frames: 'unknown',
    recovered: true,
  })
  if (result === 'unavailable') throw new Error('Tool runtime retains cold terminal obligation')
}
async function recoverEnvironmentOwners(
  input: Input,
  scope: SessionScope,
  executions: ReadonlyMap<string, ToolJournalHistory>,
) {
  const recovery = await input.dependencies.environments.recoverOwned(
    scope,
    input.dependencies.recovery,
  )
  if (recovery.kind !== 'recovered') throw new Error('Environment owner recovery unavailable')
  // Persist actual partial observations before reporting an unfinished group.
  for (const report of recovery.values) {
    const execution = [...executions.values()].find(value =>
      [...value.resources.values()].some(resource =>
        sameResource(resource.planned.value.resource, report.resource),
      ),
    )
    if (!execution) throw new Error('Environment recovery lacks an original planned resource')
    await stopReceipt(input, execution, report)
  }
  if (
    recovery.failures.length ||
    recovery.values.some(value => value.status !== 'confirmedStopped')
  )
    throw new Error('Environment owner recovery remains pending')
}
async function recoverSession(input: Input, scope: SessionScope) {
  const authorized = await input.dependencies.owner.readPrefix(input.dependencies.recovery, scope)
  if (
    authorized.kind !== 'prefix' ||
    authorized.prefix.ownerGeneration !== input.dependencies.backing.ownerGeneration
  )
    throw new Error('Tool runtime recovery owner unavailable')
  const view = await input.journal.read(scope, 'recovery-scan')
  if (view.kind !== 'view') throw new Error('Tool runtime recovery prefix unavailable')
  await recoverEnvironmentOwners(input, scope, view.executions)
  for (const execution of view.executions.values()) {
    await recoverCallResources(input, execution)
    await finishInterruptedCall(input, execution)
  }
}
/** Cold owners never replay the author. Environment-owned resources keep independent responsibility. */
export async function recoverExecutions(input: Input) {
  const sessions = await input.dependencies.owner.enumerate(input.dependencies.recovery)
  if (sessions.kind !== 'sessions') throw new Error('Tool runtime cannot enumerate owned sessions')
  for (const { scope } of sessions.sessions) await recoverSession(input, scope)
}
