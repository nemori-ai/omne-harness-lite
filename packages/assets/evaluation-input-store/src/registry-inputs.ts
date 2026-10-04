import { type RegistryInputRequest, type RegistryInputStage, type RegistryInputResult } from '@omne-harness-lite/asset-evaluation'
import { evaluate, selectEvaluationRootSource } from '@omne-harness-lite/asset-evaluation'
import { BodyProviderUnavailableError } from '@omne-harness-lite/asset-model'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as validateMessage } from '@omne-harness-lite/messages'
import { narrow, StorageUnavailable } from '@omne-harness-lite/storage'
import {
  getAssetJudge,
  buildInputWithRoot,
  emit,
  equal,
  json,
  object,
  ownDependencies,
  readSourceSnapshot,
  recipeFromRow,
  SourceUnavailable,
} from './data.ts'
import type { InputSourceDependencies, SourceDb } from './types.ts'
export interface RegistryInputReader {
  read(request: unknown): Promise<RegistryInputResult>
  close(): Promise<void>
}
function request(value: unknown): RegistryInputRequest | undefined {
  const copied = json(value)
  if (
    !object(copied) ||
    Object.keys(copied).length !== 4 ||
    typeof copied.session !== 'string' ||
    !validateMessage('SessionRef', copied.session).valid ||
    !['reload', 'refresh_availability'].includes(String(copied.purpose)) ||
    !object(copied.rootSource) ||
    Object.keys(copied.rootSource).length !== 2 ||
    !('ok' in getAssetJudge().judgeAssetValue('AssetRecordId', copied.rootSource.asset)) ||
    !(
      'ok' in
      getAssetJudge().judgeAssetValue('VersionSelection', {
        kind: 'pinned',
        number: copied.rootSource.version,
      })
    )
  )
    return undefined
  const tenant = parseTenantId(copied.tenant)
  if (!('ok' in tenant)) return undefined
  return Object.freeze({ ...copied, tenant: tenant.ok }) as unknown as RegistryInputRequest
}
function stage(error: unknown): RegistryInputStage | undefined {
  if (error instanceof StorageUnavailable) return 'storage'
  if (error instanceof BodyProviderUnavailableError) return 'body_provider'
  if (!(error instanceof SourceUnavailable)) return undefined
  if (['session_tenancy', 'current_membership', 'fixed_body'].includes(error.stage))
    return error.stage as RegistryInputStage
  if (error.stage.startsWith('recipe')) return 'recipe'
  if (['workspace_source', 'unsupported_entitlement', 'connector_body'].includes(error.stage))
    return 'unsupported_source'
  if (error.stage === 'root_body') return 'fixed_body'
  if (
    [
      'source_head',
      'factory_manifest',
      'scope_missing',
      'scope_json',
      'scope_shape',
      'holding',
      'holding_scope',
      'definition_missing',
      'definition_metadata',
      'asset_definition',
      'agent_definition_body',
      'draft',
      'version',
      'version_position',
      'factory_manifest',
      'holding_definition',
      'pinned_version',
      'ownership',
      'outer_entitlement',
    ].includes(error.stage)
  )
    return 'source'
  throw new Error('fixed-root reader encountered an undeclared source failure stage')
}
/** Standalone technical closure; no Cordis service, implicit tenant authority or source repair. */
export function createRegistryInputReader(
  dependencies: InputSourceDependencies,
): RegistryInputReader {
  const deps = ownDependencies(dependencies)
  let stopped = false
  let active = 0
  let closing: Promise<void> | undefined
  let drained: (() => void) | undefined
  return Object.freeze({
    async read(value: unknown): Promise<RegistryInputResult> {
      const inputRequest = request(value)
      if (inputRequest === undefined) return { failure: 'invalidInput' }
      if (stopped) return { failure: 'unavailable', stage: 'stopped' }
      active++
      const { session, tenant, purpose, rootSource } = inputRequest
      try {
        const holding = await deps.sessionTenancy.holdingTenant(session)
        if (!('tenant' in holding) || !tenantIdEquals(holding.tenant, tenant))
          throw new SourceUnavailable('session_tenancy')
        const requested = deps.monotonicNow()
        let acquired: bigint | undefined
        const snapshot = await deps.storage.atomic(async unit => {
          acquired = deps.monotonicNow()
          const current = await deps.memberships.participate(unit).standing(tenant)
          if (!('standing' in current) || current.standing !== 'effective')
            throw new SourceUnavailable('current_membership')
          return unit.run(() =>
            unit.query(async tx => {
              const row = await narrow<SourceDb>(tx)
                .selectFrom('evaluation_input_recipe')
                .selectAll()
                .where('store_key', '=', deps.storeKey)
                .where('session', '=', session)
                .executeTakeFirst()
              if (row === undefined) throw new SourceUnavailable('recipe')
              const recipe = recipeFromRow(row)
              if (!tenantIdEquals(recipe.tenant, tenant))
                throw new SourceUnavailable('recipe_tenant')
              return readSourceSnapshot(
                tx,
                deps,
                purpose === 'reload' ? { ...recipe, standing: current } : recipe,
                rootSource,
              )
            }),
          )
        })
        const released = deps.monotonicNow()
        if (acquired === undefined)
          throw new Error('fixed-root transaction callback never acquired its transaction')
        const extractionStarted = deps.monotonicNow()
        const input = buildInputWithRoot(snapshot, rootSource, snapshot.fixedRoot)
        const extractionNanos = (deps.monotonicNow() - extractionStarted).toString()
        const selectorStarted = deps.monotonicNow()
        const selected = selectEvaluationRootSource({
          tenant,
          standing: input.standing,
          holdings: input.holdings,
          definitions: input.definitions,
          ...(input.session === undefined ? {} : { session: input.session }),
          rootDefinition: input.root.definition,
        })
        const selectorNanos = (deps.monotonicNow() - selectorStarted).toString()
        const evaluationStarted = deps.monotonicNow()
        const evaluated = evaluate(input)
        const evaluationNanos = (deps.monotonicNow() - evaluationStarted).toString()
        let result: RegistryInputResult
        if ('invalidInput' in evaluated) {
          const c16 = evaluated.invalidInput.diagnostics.some(
            diagnostic => diagnostic.condition === 'C16',
          )
          if (c16) {
            if (!('ok' in selected) || equal(selected.ok, rootSource))
              throw new Error('C16 and shared root selector disagree')
            result = Object.freeze({
              failure: 'rootSourceMismatch',
              input,
              selected: selected.ok,
              rejection: evaluated,
              sourceRevision: snapshot.revision,
            })
          } else result = { failure: 'unavailable', stage: 'evaluation_input' }
        } else {
          if (
            'invalidInput' in selected ||
            'unavailable' in selected ||
            ('ok' in selected && !equal(selected.ok, rootSource))
          )
            throw new Error('successful fixed-root admission and shared selector disagree')
          result = { input }
        }
        emit(deps, {
          kind: 'registry_input_read',
          session,
          tenant,
          purpose,
          sourceRevision: snapshot.revision,
          fixed: rootSource,
          ...('ok' in selected ? { selected: selected.ok } : {}),
          result:
            'input' in result && !('failure' in result)
              ? 'input'
              : 'failure' in result
                ? result.failure
                : 'input',
          holdings: snapshot.holdings.length,
          assets: snapshot.definitions.length,
          versions: snapshot.versions,
          bodyBytes: snapshot.bodyBytes,
          queueNanos: (acquired - requested).toString(),
          holdNanos: (released - acquired).toString(),
          extractionNanos,
          selectorNanos,
          evaluationNanos,
          evaluationCount: 1,
        })
        return result
      } catch (error) {
        const failedAt = stage(error)
        if (failedAt === undefined) throw error
        emit(deps, {
          kind: 'registry_input_read',
          session,
          tenant,
          purpose,
          fixed: rootSource,
          result: 'unavailable',
          stage: failedAt,
        })
        return { failure: 'unavailable', stage: failedAt }
      } finally {
        active--
        if (stopped && active === 0) drained?.()
      }
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing
      stopped = true
      closing =
        active === 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              drained = resolve
            })
      return closing
    },
  })
}
