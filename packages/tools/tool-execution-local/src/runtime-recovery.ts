import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { instantFromRfc3339, instantToRfc3339 } from '@omne-harness-lite/offer-expiry'
import type { ToolRuntimeDependencies } from '@omne-harness-lite/tool-execution-runtime'
import { createResultPreparation } from './execution-result.ts'
import { createTerminalCommitter } from './execution-terminal.ts'
import { jsonObject, sameJson } from './json-values.ts'
import type { createRuntimeJournal } from './runtime-journal.ts'

/** Cold owners never replay the author executor. Delivery remains a separately durable obligation. */
export async function recoverExecutions(input: {
  readonly dependencies: ToolRuntimeDependencies
  readonly journal: ReturnType<typeof createRuntimeJournal>
  readonly attempts: number
  readonly retry: (attempt: number) => Promise<void>
}) {
  const { dependencies, journal } = input
  const sessions = await dependencies.owner.enumerate(dependencies.recovery)
  if (sessions.kind !== 'sessions') throw new Error('tool runtime cannot enumerate owned sessions')
  const terminal = createTerminalCommitter({ ...input, clock: dependencies.clock })
  for (const { scope } of sessions.sessions) {
    const authorized = await dependencies.owner.readPrefix(dependencies.recovery, scope)
    if (
      authorized.kind !== 'prefix' ||
      authorized.prefix.ownerGeneration !== dependencies.backing.ownerGeneration
    )
      throw new Error('tool runtime recovery owner unavailable')
    const view = await journal.read(scope, 'recovery-scan')
    if (view.kind !== 'view') throw new Error('tool runtime recovery prefix unavailable')
    for (const execution of view.executions.values()) {
      const intent = execution.intent.value
      const outstanding = [...execution.resources.values()]
        .filter(resource => resource.observations.at(-1)?.value.status !== 'confirmed')
        .map(resource => resource.planned.value.resource)
      const recovered = await dependencies.environments.recover(
        scope,
        dependencies.recovery,
        outstanding,
      )
      if (!Array.isArray(recovered) || recovered.length !== outstanding.length)
        throw new Error('tool runtime retains resource recovery obligation')
      for (let index = 0; index < outstanding.length; index++) {
        const item = recovered[index]!,
          resource = outstanding[index]!
        const copied = copyJsonValue(item.resource)
        if (
          'failed' in copied ||
          !sameJson(
            copied.ok,
            resource as unknown as import('@omne-harness-lite/content-blocks').JsonValue,
          ) ||
          item.status !== 'confirmedStopped'
        )
          throw new Error('tool runtime retains unconfirmed resource cleanup')
        const now = dependencies.clock.now()
        if (now === 'unavailable') throw new Error('tool runtime recovery clock unavailable')
        let recorded = false
        for (let attempt = 0; attempt < input.attempts; attempt++) {
          const current = await journal.read(scope, intent.ref.callId)
          if (current.kind !== 'view') break
          if (
            current.executions
              .get(intent.ref.callId)
              ?.resources.get(resource.key)
              ?.observations.at(-1)?.value.status === 'confirmed'
          ) {
            recorded = true
            break
          }
          const commit = await journal.commit({
            ref: intent.ref,
            origin: intent.origin,
            expected: current.prefix,
            values: [
              {
                kind: 'physical_stop_observed',
                revision: 1,
                ref: intent.ref,
                key: resource.key,
                status: 'confirmed',
                at: instantToRfc3339(now),
              },
            ],
          })
          if (commit.kind === 'view') {
            recorded = true
            break
          }
          if (commit.reason !== 'tailChanged') break
          await input.retry(attempt)
        }
        if (!recorded) throw new Error('tool runtime retains resource stop receipt')
      }
      if (!execution.terminal) {
        const data = intent.input
        if (
          !jsonObject(data) ||
          data.format !== 'tool-input/1' ||
          typeof data.acceptedAt !== 'string' ||
          typeof data.pass !== 'string' ||
          data.chain === undefined ||
          !('ok' in instantFromRfc3339(data.acceptedAt))
        )
          throw new Error('tool runtime recovery coordinates invalid')
        const prepared = await createResultPreparation({
          ref: intent.ref,
          chain: data.chain,
          pass: data.pass,
        })({ outcome: 'failed', code: 'abnormal_interruption' })
        if (prepared === 'unavailable') throw new Error('tool runtime recovery basis unavailable')
        const committed = await terminal({
          ref: intent.ref,
          origin: intent.origin,
          ...prepared,
          startedAt: execution.started?.value.at ?? data.acceptedAt,
          frames: 'unknown',
          recovered: true,
        })
        if (committed === 'unavailable')
          throw new Error('tool runtime retains cold terminal obligation')
      }
    }
  }
}
