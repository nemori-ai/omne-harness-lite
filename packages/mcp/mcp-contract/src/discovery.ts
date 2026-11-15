import type { Outcome } from '@omne-harness/operation-result'
import { concludeProbe, malformed, type ProtocolVersions, type WireAnswer } from './decisions.ts'
import type { IdentityBound } from './readers.ts'
import type { TransportFailure } from './transport.ts'
import type { PeerIdentity } from './values.ts'

export type DiscoverPaths = Readonly<{
  probe(version: string, request: 'discover' | 'discover-retry'): Promise<WireAnswer>
  legacy(): Promise<Outcome<PeerIdentity, TransportFailure>>
}>

export async function discoverWith(
  paths: DiscoverPaths,
  versions: ProtocolVersions,
  bound: IdentityBound,
): Promise<Outcome<PeerIdentity, TransportFailure>> {
  let probe = concludeProbe(await paths.probe(versions[0], 'discover'), 'discover', versions, bound)
  if (probe.kind === 'retry')
    probe = concludeProbe(
      await paths.probe(probe.version, 'discover-retry'),
      'discover-retry',
      versions,
      bound,
    )
  switch (probe.kind) {
    case 'identity':
      return { ok: probe.identity }
    case 'final':
      return { failure: probe.failure }
    case 'legacy-peer':
      return paths.legacy()
    case 'fallback': {
      const legacy = await paths.legacy()
      return 'ok' in legacy ? legacy : { failure: probe.failure }
    }
    case 'retry':
      return { failure: malformed('discover-shape') }
    default: {
      const exhaustive: never = probe
      return exhaustive
    }
  }
}

export async function withOneResend<A extends Readonly<{ wire: WireAnswer }>>(
  send: () => Promise<A>,
): Promise<A> {
  const first = await send()
  return first.wire.kind === 'no-answer' && first.wire.resend ? send() : first
}
