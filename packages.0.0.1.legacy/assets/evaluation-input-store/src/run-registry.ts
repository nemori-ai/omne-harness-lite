import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import type { RunRegistryReaderDependencies, RunRegistryReaders } from './admitted-types.ts'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as validateMessage } from '@omne-harness-lite/messages'
import { createRegistryInputReaderWithUnit, registryInputRequest } from './registry-input-reader.ts'
import {
  createRegistryHistoryReaderWithUnit,
  registryHistoryRequest,
} from './registry-history-reader.ts'
import { createAuthorizedInputRead } from './admitted-unit.ts'
import { SourceUnavailable } from './data.ts'
import type { RegistryReadUnit } from './registry-read-unit.ts'

export function createRunRegistryReaders(
  dependencies: RunRegistryReaderDependencies,
): RunRegistryReaders {
  const tenant = parseTenantId(dependencies.scope?.tenant)
  const session = dependencies.scope?.session
  if (
    !('ok' in tenant) ||
    !validateMessage('SessionRef', session).valid ||
    typeof dependencies.withOriginalRunUnit !== 'function'
  )
    throw new TypeError('Run registry readers require a fixed Session and original Run unit')
  const matches = (scope: { session: string; tenant: typeof tenant.ok }) =>
    scope.session === session && tenantIdEquals(scope.tenant, tenant.ok)
  const authorized = createAuthorizedInputRead(
    dependencies.storage,
    dependencies.withOriginalRunUnit.bind(dependencies),
  )
  const readUnit: RegistryReadUnit = (scope, read) => {
    if (!matches(scope)) throw new SourceUnavailable('current_membership')
    return authorized(unit => read(unit))
  }
  const owned = { ...dependencies, evaluator: dependencies.evaluator ?? createAssetEvaluator() }
  const fixedRoot = createRegistryInputReaderWithUnit(owned, readUnit)
  const history = createRegistryHistoryReaderWithUnit(owned, readUnit)
  let closed = false
  return Object.freeze<RunRegistryReaders>({
    fixedRoot: Object.freeze<RunRegistryReaders['fixedRoot']>({
      async read(input) {
        if (closed) return { failure: 'unavailable', stage: 'stopped' }
        const request = registryInputRequest(input)
        if (!request) return { failure: 'invalidInput' }
        if (!matches(request) || request.purpose === 'reload')
          return { failure: 'unavailable', stage: 'current_membership' }
        return fixedRoot.read(request)
      },
      close: fixedRoot.close,
    }),
    history: Object.freeze<RunRegistryReaders['history']>({
      async read(input) {
        if (closed) return { failure: 'unavailable', stage: 'stopped' }
        const request = registryHistoryRequest(input)
        if (!request) return { failure: 'invalidInput' }
        if (!matches(request)) return { failure: 'unavailable', stage: 'current_membership' }
        return history.read(request)
      },
      close: history.close,
    }),
    async close() {
      closed = true
      await Promise.all([fixedRoot.close(), history.close()])
    },
  })
}
