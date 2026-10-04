import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as messageValidate } from '@omne-harness-lite/messages'
import { narrow, StorageUnavailable } from '@omne-harness-lite/storage'
import { BodyProviderUnavailableError } from '@omne-harness-lite/asset-model'
import {
  ownDependencies,
  emit,
  inputFromSnapshot,
  readSourceSnapshot,
  recipeFromRow,
  SourceUnavailable,
} from './data.ts'
import type {
  CurrentInputReader,
  CurrentInputResult,
  InputSourceDependencies,
  SourceDb,
} from './types.ts'

export function createEvaluationInputReader(
  dependencies: InputSourceDependencies,
): CurrentInputReader {
  const deps = ownDependencies(dependencies)
  let stopped = false
  let active = 0
  let closing: Promise<void> | undefined
  let drain: (() => void) | undefined
  return Object.freeze({
    async read(value: unknown, tenantValue: unknown): Promise<CurrentInputResult> {
      const tenant = parseTenantId(tenantValue)
      if (
        typeof value !== 'string' ||
        !messageValidate('SessionRef', value).valid ||
        !('ok' in tenant)
      )
        return { failure: 'invalidInput' }
      if (stopped) return { failure: 'unavailable' }
      active++
      let requested: bigint | undefined
      let acquired: bigint | undefined
      try {
        const holding = await deps.sessionTenancy.holdingTenant(value)
        if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, tenant.ok))
          throw new SourceUnavailable('session_tenancy')
        requested = deps.monotonicNow()
        const snapshot = await deps.storage.atomic(async unit => {
          acquired = deps.monotonicNow()
          const standing = await deps.memberships.participate(unit).standing(tenant.ok)
          if (!('standing' in standing) || standing.standing !== 'effective')
            throw new SourceUnavailable('current_membership')
          return unit.run(() =>
            unit.query(async tx => {
              const row = await narrow<SourceDb>(tx)
                .selectFrom('evaluation_input_recipe')
                .selectAll()
                .where('store_key', '=', deps.storeKey)
                .where('session', '=', value)
                .executeTakeFirst()
              if (row === undefined) throw new SourceUnavailable('session_recipe')
              const recipe = recipeFromRow(row)
              if (!tenantIdEquals(recipe.tenant, tenant.ok))
                throw new SourceUnavailable('recipe_tenant')
              return readSourceSnapshot(tx, deps, recipe)
            }),
          )
        })
        const ended = deps.monotonicNow()
        if (acquired === undefined)
          throw new Error('atomic callback did not acquire its transaction')
        const result = inputFromSnapshot(snapshot, deps)
        emit(deps, {
          kind: 'evaluation_input_read',
          session: value,
          tenant: tenant.ok,
          revision: result.revision,
          source: result.input.root.source,
          holdings: result.holdings,
          assets: result.assets,
          versions: result.versions,
          bodyBytes: result.bodyBytes,
          queueNanos: (acquired - requested).toString(),
          holdNanos: (ended - acquired).toString(),
          selectorNanos: result.selectorNanos,
          evaluationNanos: result.evaluationNanos,
          evaluationCount: 1,
          result: 'success',
        })
        return { input: result.input }
      } catch (error) {
        if (!(
          error instanceof SourceUnavailable ||
          error instanceof StorageUnavailable ||
          error instanceof BodyProviderUnavailableError
        ))
          throw error
        emit(deps, {
          kind: 'evaluation_input_read',
          session: value,
          tenant: tenant.ok,
          result: 'unavailable',
          stage:
            error instanceof SourceUnavailable
              ? error.stage
              : error instanceof StorageUnavailable
                ? 'storage'
                : 'body_provider',
        })
        return { failure: 'unavailable' }
      } finally {
        active--
        if (stopped && active === 0) drain?.()
      }
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing
      stopped = true
      closing =
        active === 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              drain = resolve
            })
      return closing
    },
  })
}
