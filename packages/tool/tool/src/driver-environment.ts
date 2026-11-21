import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  PreparationRecord,
  ToolRecovery,
} from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'
import { checkedPreparationProgress, matchEnvironmentAdoption } from './environment-adoption.ts'

type Reconnection<E> =
  | Readonly<{ kind: 'at-hand'; environment: E }>
  | Readonly<{ kind: 'lost'; diagnostic: string }>
  | Readonly<{ kind: 'not-prepared'; progress: string }>

export function createPreparedEnvironments<P, B extends ContentBlock, E>(
  environments: ToolDependencies<P, B, E>['environments'],
  prepared: Map<string, E>,
  keyOf: (access: CallAccess<P>) => string,
) {
  const reconnect = async (
    access: CallAccess<P>,
    recovery: ToolRecovery,
    preparation: PreparationRecord,
  ): Promise<Outcome<Reconnection<E>, ToolFailure>> => {
    const matching = matchEnvironmentAdoption(environments, preparation.adoption)
    if ('failure' in matching) return matching
    const kept = prepared.get(keyOf(access))
    if (kept !== undefined) return succeed({ kind: 'at-hand', environment: kept })
    const read = await environments.inspectPreparation({
      principal: access.principal,
      tenant: access.tenant,
      call: access.call,
      preparation,
      request: recovery.request,
    })
    if ('failure' in read) return read
    if (read.ok.kind === 'lost') return succeed({ kind: 'lost', diagnostic: read.ok.diagnostic })
    const checked = checkedPreparationProgress(read.ok, preparation)
    if ('failure' in checked) return checked
    if (checked.ok.kind !== 'prepared')
      return succeed({ kind: 'not-prepared', progress: read.ok.kind })
    prepared.set(keyOf(access), checked.ok.environment.value)
    return succeed({ kind: 'at-hand', environment: checked.ok.environment.value })
  }

  return {
    reconnect,
    async of(
      access: CallAccess<P>,
      recovery: ToolRecovery,
      preparation: PreparationRecord,
    ): Promise<Outcome<E, ToolFailure>> {
      const found = await reconnect(access, recovery, preparation)
      if ('failure' in found) return found
      if (found.ok.kind === 'at-hand') return succeed(found.ok.environment)
      return fail({
        kind: 'unavailable',
        dependency: 'tool-environment',
        diagnostic: `the prepared environment cannot be reconnected: ${
          found.ok.kind === 'lost' ? 'lost' : found.ok.progress
        }`,
      })
    },
  }
}
