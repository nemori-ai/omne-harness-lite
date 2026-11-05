// The `model-credential` row (application assembly, model-host-local credential plugin): the
// file-backed credential custody of the single-machine host. It injects nothing and has no shutdown
// phase: the plugin closes its custodian on its own fiber. The configuration is the plugin's own
// (`path`, `factorySecret`, optional `lock` and `diagnosticsCapacity`) and the plugin validates it.
//
// The row loads the managed credential plugin (`createLocalCredentialPlugin`) as its child: the
// child provides `modelCredential` exactly as `LocalCredentialPlugin` does, and the row keeps the
// binding management of that child for the trusted key `modelCredentialCustody`. Each management
// call is admitted over `principalVerifier` and `tenantStanding`, which the row reads per call: an
// absent dependency answers `basis-unavailable` and never holds the row `PENDING`.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { referenceAdmissionCheck } from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import { modelCredentialKey } from '@omne-harness/model-cordis-contract/cordis'
import {
  LocalCredentialPlugin,
  createLocalCredentialPlugin,
} from '@omne-harness/model-host-local/cordis'
import type { CreateOptions } from '@omne-harness/model-host-local'
import type { ModelCredentialCustody } from '@omne-harness/server-entry'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { defineRow } from '../../row.ts'
import { createModelCredentialGuard } from '../authorization/model-credential-access.ts'
import { createTenantCredentialCustody } from './custody.ts'
import { ModelCredentialCustodyService, modelCredentialCustodyKey } from './custody-service.ts'

// The service keeps closures only: a method reached through a caller proxy has a `this` that is not
// the instance (docs/real-mode.md).
class ModelCredentialCustodyImpl extends ModelCredentialCustodyService {
  readonly bind: ModelCredentialCustody['bind']
  readonly unbind: ModelCredentialCustody['unbind']
  readonly describe: ModelCredentialCustody['describe']
  constructor(ctx: Context, delegate: ModelCredentialCustody) {
    super(ctx)
    this.bind = input => delegate.bind(input)
    this.unbind = input => delegate.unbind(input)
    this.describe = input => delegate.describe(input)
  }
}

/** The verifier and the standing source of the tree, read on every call. */
function identityPorts(ctx: Context) {
  const verifier: PrincipalVerifier = {
    verify: value => {
      const current: PrincipalVerifier | undefined = ctx.get(principalVerifierKey)
      return current === undefined
        ? Promise.resolve({ kind: 'unavailable', diagnostic: 'principal verifier absent' })
        : current.verify(value)
    },
  }
  const standing: TenantStandingSource = {
    read: input => {
      const current: TenantStandingSource | undefined = ctx.get(tenantStandingKey)
      if (current === undefined) throw new Error('tenant standing is not installed')
      return current.read(input)
    },
  }
  return { verifier, standing }
}

const plugin: Plugin.Object = {
  name: 'model-credential',
  Config: LocalCredentialPlugin.Config,
  async apply(ctx: Context, config: CreateOptions) {
    const managed = createLocalCredentialPlugin()
    await ctx.plugin(managed.plugin, config)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'model-credential.active',
    )
    const { verifier, standing } = identityPorts(ctx)
    const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
    const guard = createModelCredentialGuard(() => (active ? admission : undefined))
    new ModelCredentialCustodyImpl(
      ctx,
      createTenantCredentialCustody({
        custody: managed.custody,
        qualify: input => guard.qualify(input),
        now: readSystemInstant,
      }),
    )
  },
}

export const modelCredentialRow = defineRow({
  row: 'model-credential',
  implementation: 'real',
  manifest: {
    provides: [modelCredentialKey, modelCredentialCustodyKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
