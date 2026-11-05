import { randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAccessGuard } from '@omne-harness/tool'
import type {
  ToolCallId,
  ToolExecutionRef,
  ToolFailure,
  ToolInstanceId,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolDirectory,
  ToolHandle,
  ToolInstanceHost,
} from '@omne-harness/tool-contract/provider'

export function instanceCallKey(
  input: Readonly<{ tenant: TenantId; call: ToolCallId }>,
): Outcome<string, ToolFailure> {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) return fail({ kind: 'denied', action: 'tenant-identity' })
  return succeed(JSON.stringify([tenant.value, input.call]))
}

export async function qualifyInstanceAccess<P>(
  guard: ToolAccessGuard<P>,
  input: CallAccess<P>,
  action: 'lookup' | 'recover',
): Promise<Outcome<void, ToolFailure>> {
  try {
    const verdict = await guard.qualify({ ...input, action })
    if (verdict.kind === 'allowed') return succeed(undefined)
    if (verdict.kind === 'denied') return fail({ kind: 'denied', action })
    return fail({
      kind: 'unavailable',
      dependency: 'tool-instance-access',
      diagnostic: verdict.diagnostic,
    })
  } catch {
    return fail({
      kind: 'unavailable',
      dependency: 'tool-instance-access',
      diagnostic: 'The access guard threw; its error text is withheld.',
    })
  }
}

type Publication<P> = Readonly<{
  execution: ToolExecutionRef
  handle: ToolHandle<P>
  registration: string
}>

/** Live routes only. Publication generations remain pinned until this directory is discarded. */
export function createLocalToolInstanceDirectory<P>(
  input: Readonly<{
    access: ToolAccessGuard<P>
    instance: ToolInstanceId
  }>,
): Readonly<{
  directory: ToolDirectory<P>
  publish: ToolInstanceHost<P>['publish']
  withdraw: ToolInstanceHost<P>['withdraw']
}> {
  const { access, instance } = input
  const routes = new Map<string, Publication<P>>()
  const generations = new Map<string, string>()

  const publish: ToolInstanceHost<P>['publish'] = async (execution, handle) => {
    const key = instanceCallKey(execution)
    if ('failure' in key) return key
    if (execution.instance !== instance || handle.instance !== instance)
      return fail({ kind: 'stale-instance', instance: execution.instance })
    if (handle.generation !== execution.generation)
      return fail({ kind: 'invalid', field: 'publication', reason: 'handle-generation-mismatch' })
    const generation = generations.get(key.ok)
    if (generation !== undefined && generation !== execution.generation)
      return fail({ kind: 'invalid', field: 'publication', reason: 'generation-conflict' })
    const previous = routes.get(key.ok)
    if (previous !== undefined) {
      if (previous.handle !== handle)
        return fail({ kind: 'invalid', field: 'publication', reason: 'handle-conflict' })
      return succeed({ execution: previous.execution, registration: previous.registration })
    }
    const publication = Object.freeze({
      execution: Object.freeze({ ...execution }),
      handle,
      registration: randomUUID(),
    })
    generations.set(key.ok, execution.generation)
    routes.set(key.ok, publication)
    return succeed({ execution: publication.execution, registration: publication.registration })
  }

  const withdraw: ToolInstanceHost<P>['withdraw'] = async ({ execution, registration }) => {
    const key = instanceCallKey(execution)
    if ('failure' in key) return key
    const current = routes.get(key.ok)
    if (
      current === undefined ||
      current.registration !== registration ||
      current.execution.instance !== execution.instance ||
      current.execution.generation !== execution.generation
    )
      return succeed({ removed: false })
    routes.delete(key.ok)
    return succeed({ removed: true })
  }

  const directory: ToolDirectory<P> = Object.freeze({
    connect: async (request: CallAccess<P>) => {
      const fixed = { ...request }
      const allowed = await qualifyInstanceAccess(access, fixed, 'lookup')
      if ('failure' in allowed) return allowed
      const key = instanceCallKey(fixed)
      if ('failure' in key) return key
      const route = routes.get(key.ok)
      return route === undefined
        ? succeed({ kind: 'no-live-route' as const })
        : succeed({ kind: 'live' as const, handle: route.handle })
    },
  })
  return Object.freeze({ directory, publish, withdraw })
}
