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
