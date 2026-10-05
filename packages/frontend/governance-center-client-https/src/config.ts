import {
  GovernanceClientConfigurationError,
  type PublicHealthOptions,
} from '@omne-harness-lite/governance-center-entry-https-json'

export interface HealthRequestConfiguration {
  readonly url: URL
  readonly ca: Buffer | undefined
  readonly pin: string | undefined
  readonly timeoutMs: number
  readonly signal: AbortSignal | undefined
}

export function captureConfiguration(options: PublicHealthOptions): HealthRequestConfiguration {
  let url: URL
  try {
    url = new URL(options.url)
  } catch {
    throw new GovernanceClientConfigurationError('center URL must be a valid HTTPS URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new GovernanceClientConfigurationError(
      'center URL requires HTTPS without userinfo, query or fragment',
    )
  const timeoutMs = options.timeoutMs ?? 10_000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new GovernanceClientConfigurationError('timeoutMs must be an integer from 1 to 120000')
  const trust = options.trust ?? { mode: 'ca' }
  let ca: Buffer | undefined
  let pin: string | undefined
  switch (trust.mode) {
    case 'ca': {
      if (trust.certificateAuthorities !== undefined) {
        ca = Buffer.from(trust.certificateAuthorities)
        if (ca.length === 0)
          throw new GovernanceClientConfigurationError('certificateAuthorities cannot be empty')
      }
      break
    }
    case 'spki': {
      if (!/^[0-9a-fA-F]{64}$/.test(trust.sha256))
        throw new GovernanceClientConfigurationError(
          'SPKI SHA256 must contain 64 hexadecimal digits',
        )
      pin = trust.sha256.toLowerCase()
      break
    }
    default:
      throw new GovernanceClientConfigurationError('unsupported center trust mode')
  }
  return { url, ca, pin, timeoutMs, signal: options.signal }
}
