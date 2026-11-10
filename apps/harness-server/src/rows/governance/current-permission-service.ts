import { Service, type Context } from '@deepseek-ai/cordis'
import { noArguments, referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  PermissionBasisRequestSchema,
  type PermissionBasisSource,
  type PermissionBasisRequest,
} from '@omne-harness/permissions'
import type {
  ToolPermissionAction,
  ToolPermissionContext,
} from '../authorization/current-tool-permission.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import type { TenantGovernanceHost } from './tenant-host.ts'
import { capturedInquirySchema } from './permission-inquiry.ts'

type Runtime = NonNullable<Awaited<ReturnType<TenantGovernanceHost['runtime']>>>
type Options = Readonly<{
  identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>
  runtime(
    tenant: string,
  ): Promise<Pick<Runtime, 'permissionRequest' | 'permissionBasis'> | undefined>
}>

function snapshot(input: ToolPermissionAction): ToolPermissionAction {
  const { principal, tenant, ...data } = input
  return { ...structuredClone(data), principal, tenant }
}
const unavailable = () => ({
  kind: 'unavailable' as const,
  sourceRef: 'harness.current-permission',
})

/** Trusted application query. Identity is checked before lazy tenant installation. */
export class CurrentPermissionService
  extends Service
  implements PermissionBasisSource<ToolPermissionContext>
{
  static readonly provide = 'currentToolPermission'
  readonly request: (input: ToolPermissionAction) => Promise<PermissionBasisRequest | undefined>
  readonly readCurrent: PermissionBasisSource<ToolPermissionContext>['readCurrent']

  constructor(ctx: Context, options: Options) {
    super(ctx, CurrentPermissionService.provide)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'governance.current-permission',
    )
    const admission = referenceAdmissionCheck({ ...options.identity, permits: null })
    const runtimeFor = async (input: ToolPermissionAction) => {
      if (!active) return undefined
      const who = sessionWorkOf(input.principal, input.tenant)
      const tenant = tenantCodec.encode(input.tenant)
      if (who === undefined || !tenant.ok) return undefined
      const checked = await admission.check({
        access: { principal: input.principal, tenant: input.tenant },
        operation: { owner: 'permissions', name: 'read-current' },
        target: { owner: 'session', kind: 'session', key: who.session },
        arguments: noArguments(),
        requires: [],
        permit: null,
      })
      if (!active || checked.kind !== 'allowed') return undefined
      const runtime = await options.runtime(tenant.value)
      return active ? runtime : undefined
    }
    this.request = async raw => {
      try {
        const input = snapshot(raw)
        const runtime = await runtimeFor(input)
        const request = await runtime?.permissionRequest(input)
        return active ? request : undefined
      } catch {
        return undefined
      }
    }
    this.readCurrent = async (raw, given) => {
      try {
        const input = { ...snapshot(raw), inquiry: capturedInquirySchema.parse(raw.inquiry) }
        const request = PermissionBasisRequestSchema.safeParse(given)
        if (!request.success) return { kind: 'invalid-input', reason: 'structure' }
        const runtime = await runtimeFor(input)
        if (runtime?.permissionBasis === undefined) return unavailable()
        const result = await runtime.permissionBasis.readCurrent(input, request.data)
        return active ? result : unavailable()
      } catch {
        return unavailable()
      }
    }
  }
}
export const currentToolPermissionKey = CurrentPermissionService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    currentToolPermission: CurrentPermissionService
  }
}
