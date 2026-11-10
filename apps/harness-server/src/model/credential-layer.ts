// The credential layer of a profile supplier (model-contract「凭据引用与解析端口」). Request
// preparation, and the preparation leases of the send stage, fix the layer of every supplier
// through the Model credential port: the tenant's own layer when the tenant set any item of the
// provider, the official layer only for an official profile of a provider the release holds. The
// secrets are not read here; the send reads the fixed layer in its fence.
import type { SupplierPort } from '@omne-harness/model'
import type { ModelFailure } from '@omne-harness/model-contract'
import type { CredentialFailure, CredentialPort } from '@omne-harness/model-contract/provider'

const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: 'model-credential',
  diagnostic,
})

function preparationFailure(failure: CredentialFailure): ModelFailure {
  switch (failure.kind) {
    case 'denied':
      return { kind: 'denied', action: 'model-credential' }
    case 'unavailable':
      return unavailable('credential-custody-unavailable')
    default:
      return unavailable(`credential-${failure.kind}`)
  }
}

/**
 * Completes a profile supplier with its credential layer. A port that is absent or cannot judge
 * stops the preparation: it never picks a layer by itself.
 */
export function credentialLayerSupplier(
  readPort: () => CredentialPort | undefined,
): SupplierPort<unknown> {
  return ({ supplier, profile, principal, tenant }) => {
    const port = readPort()
    if (port === undefined) return { failure: unavailable('credential-custody-absent') }
    let layer: ReturnType<CredentialPort['layerOf']>
    try {
      layer = port.layerOf({
        provider: supplier.provider,
        official: profile.identity.scope.kind === 'factory',
        access: { principal, tenant },
      })
    } catch {
      return { failure: unavailable('credential-custody-failed') }
    }
    if ('failure' in layer) return { failure: preparationFailure(layer.failure) }
    return {
      ok: {
        adoption: supplier.adoption,
        provider: supplier.provider,
        model: supplier.model,
        credential: layer.ok,
      },
    }
  }
}
