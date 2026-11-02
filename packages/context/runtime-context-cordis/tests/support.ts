import { Context, type Plugin } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  RuntimeContextAuthority,
  ScopeBindingSource,
  ScopeRef,
  SuppliedBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { RuntimeContextTrustService } from '@omne-harness/runtime-context-cordis-contract/cordis'

export function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('Invalid fixture tenant')
  return parsed.value
}

export const tenantA = tenantOf('1')
export const tenantB = tenantOf('2')

export function scope(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if (!('ok' in decoded)) throw new Error('Invalid fixture scope')
  return decoded.ok
}

export const descriptor: SuppliedBlockDescriptor<'test.value', unknown> & { volatility: 'stable' } =
  {
    kind: 'supplied',
    key: 'test.value',
    schema: {
      '~standard': {
        version: 1,
        vendor: 'tests',
        validate: value =>
          typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
      },
    },
    consumers: ['model', 'tool'],
    required: true,
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    recovery: 'reread',
  }

/** A trust provider class that hands the given ports to the provider plugin. */
export function trustOf(ports: {
  authority: RuntimeContextAuthority<unknown>
  bindings: ScopeBindingSource
}) {
  return class Trust extends RuntimeContextTrustService<unknown> {
    readonly authority = ports.authority
    readonly bindings = ports.bindings
  }
}

export function plugin(
  name: string,
  apply: (ctx: Context) => unknown,
  inject?: Plugin.Object['inject'],
): Plugin.Object {
  const result: Plugin.Object = { name, apply }
  if (inject !== undefined) result.inject = inject
  return result
}

export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

export { Context }
