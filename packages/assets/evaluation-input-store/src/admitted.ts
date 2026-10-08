import {
  parseTenantId,
  tenantIdEquals,
  parseMembershipStanding,
  isOk,
} from '@omne-harness-lite/identity-values'
import { validate as messageValidate } from '@omne-harness-lite/messages'
import { narrow, StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import { BodyProviderUnavailableError } from '@omne-harness-lite/asset-model'
import {
  ownDependencies,
  inputFromSnapshot,
  readSourceSnapshot,
  recipeFromRow,
  SourceUnavailable,
  emit,
} from './data.ts'
import { sessionRecipe, captureRecipeIn } from './recipe-store.ts'
import type { SourceDb } from './types.ts'
import type { AdmittedInputSource, AdmittedInputSourceDependencies } from './admitted-types.ts'

/** One Session's source. The trusted unit owner supplies current authorization; stored role data never grants it. */
export function createAdmittedEvaluationInputSource(
  dependencies: AdmittedInputSourceDependencies,
): AdmittedInputSource {
  const deps = ownDependencies(dependencies)
  const tenant = parseTenantId(deps.scope?.tenant)
  if (
    !isOk(tenant) ||
    !messageValidate('SessionRef', deps.scope?.session).valid ||
    typeof deps.withAuthorizedUnit !== 'function' ||
    typeof deps.readCreationStanding !== 'function'
  )
    throw new TypeError('admitted input source requires a fixed Session and actual authority ports')
  const scope = Object.freeze({ tenant: Object.freeze(tenant.ok), session: deps.scope.session })
  const withUnit = deps.withAuthorizedUnit.bind(deps)
  const creationStanding = deps.readCreationStanding.bind(deps)
  const holdingTenant = deps.sessionTenancy.holdingTenant.bind(deps.sessionTenancy)
  const jobs = new Set<Promise<unknown>>()
  let stopped = false,
    closing: Promise<void> | undefined
  function close() {
    stopped = true
    return (closing ??= Promise.allSettled([...jobs]).then(() => undefined))
  }
  async function owned<T>(run: () => Promise<T>, unavailable: T): Promise<T> {
    if (stopped) return unavailable
    const job = run()
    jobs.add(job)
    try {
      return await job
    } finally {
      jobs.delete(job)
    }
  }
  async function authorized<T>(read: (unit: StorageUnit) => Promise<T>): Promise<T> {
    let invoked = false,
      original: T | undefined
    let callbackFailure: { error: unknown } | undefined
    const outcome = await withUnit(async unit => {
      if (invoked) {
        callbackFailure = {
          error: new TypeError('authorized input callback invoked more than once'),
        }
        throw callbackFailure.error
      }
      invoked = true
      try {
        unit.assertStorage(deps.storage)
        original = await read(unit)
        return original
      } catch (error) {
        callbackFailure = { error }
        throw error
      }
    })
    if (callbackFailure) throw callbackFailure.error
    if ('unavailable' in outcome) throw new SourceUnavailable('current_authorization')
    if (!invoked || outcome.read !== original)
      throw new TypeError('authorized input source did not return its original unit result')
    return outcome.read
  }
  async function checkHolding() {
    const current = await holdingTenant(scope.session)
    if (!('tenant' in current) || !tenantIdEquals(current.tenant, scope.tenant))
      throw new SourceUnavailable('session_tenancy')
  }
  function unavailable(error: unknown, operation: 'read' | 'capture') {
    if (!(
      error instanceof SourceUnavailable ||
      error instanceof StorageUnavailable ||
      error instanceof BodyProviderUnavailableError
    ))
      throw error
    emit(deps, {
      kind: 'evaluation_input_' + operation,
      session: scope.session,
      tenant: scope.tenant,
      result: 'unavailable',
      stage:
        error instanceof SourceUnavailable
          ? error.stage
          : error instanceof StorageUnavailable
            ? 'storage'
            : 'body_provider',
    })
    return { failure: 'unavailable' } as const
  }
  const reader: AdmittedInputSource['reader'] = Object.freeze<AdmittedInputSource['reader']>({
    async read(session, tenantValue) {
      const requested = parseTenantId(tenantValue)
      if (
        typeof session !== 'string' ||
        !messageValidate('SessionRef', session).valid ||
        !isOk(requested)
      )
        return { failure: 'invalidInput' }
      if (session !== scope.session || !tenantIdEquals(requested.ok, scope.tenant))
        return { failure: 'unavailable' }
      return owned(
        async () => {
          try {
            await checkHolding()
            const snapshot = await authorized(unit =>
              unit.run(() =>
                unit.query(async tx => {
                  const row = await narrow<SourceDb>(tx)
                    .selectFrom('evaluation_input_recipe')
                    .selectAll()
                    .where('store_key', '=', deps.storeKey)
                    .where('session', '=', scope.session)
                    .executeTakeFirst()
                  if (!row) throw new SourceUnavailable('session_recipe')
                  const recipe = recipeFromRow(row)
                  if (!tenantIdEquals(recipe.tenant, scope.tenant))
                    throw new SourceUnavailable('recipe_tenant')
                  return readSourceSnapshot(tx, deps, recipe)
                }),
              ),
            )
            const current = inputFromSnapshot(snapshot, deps)
            emit(deps, {
              kind: 'evaluation_input_read',
              session: scope.session,
              tenant: scope.tenant,
              revision: current.revision,
              source: current.input.root.source,
              result: 'success',
            })
            return { input: current.input }
          } catch (error) {
            return unavailable(error, 'read')
          }
        },
        { failure: 'unavailable' } as const,
      )
    },
    close,
  })
  const capture: AdmittedInputSource['captureSessionRecipe'] = async value => {
    const request = sessionRecipe(value)
    if (
      !request ||
      request.input.session !== scope.session ||
      !tenantIdEquals(request.tenant, scope.tenant)
    )
      return { failure: 'invalidInput' }
    return owned(
      async () => {
        try {
          await checkHolding()
          if (request.input.workspace !== undefined) throw new SourceUnavailable('workspace_source')
          const standing = parseMembershipStanding(await creationStanding())
          if (!isOk(standing) || standing.ok.standing !== 'effective')
            throw new SourceUnavailable('creation_standing')
          const result = await authorized(unit =>
            captureRecipeIn(unit, deps, request.input, request.tenant, standing.ok),
          )
          emit(deps, {
            kind: 'evaluation_input_capture',
            session: scope.session,
            tenant: scope.tenant,
            result: 'captured' in result ? 'committed' : result.failure,
          })
          return result
        } catch (error) {
          return unavailable(error, 'capture')
        }
      },
      { failure: 'unavailable' } as const,
    )
  }
  return Object.freeze({ reader, captureSessionRecipe: capture, close })
}
export type { AdmittedInputSource, AdmittedInputSourceDependencies } from './admitted-types.ts'
