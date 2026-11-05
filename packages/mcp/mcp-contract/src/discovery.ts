// The orchestration of `discover` (SPEC T3, T8 D rows, I rows), once for every transport: the
// probes and the legacy path, as the transport sends them, with the conclusion of each probe.
import type { Outcome } from '@omne-harness/operation-result'
import { concludeProbe, malformed, type ProtocolVersions, type WireAnswer } from './decisions.ts'
import type { IdentityBound } from './readers.ts'
import type { TransportFailure } from './transport.ts'
import type { PeerIdentity } from './values.ts'

/** The two paths of a transport's `discover`: the probes and the legacy path, as the transport sends them. */
export type DiscoverPaths = Readonly<{
  /** Sends one `server/discover` with this `_meta` version and waits for its answer. */
  probe(version: string, request: 'discover' | 'discover-retry'): Promise<WireAnswer>
  /** The legacy path (T3): `initialize`, then `notifications/initialized` when it read. */
  legacy(): Promise<Outcome<PeerIdentity, TransportFailure>>
}>

/**
 * `discover` (T3): the modern path first, `server/discover` once more after a `-32022` that
 * names a version in common (D04); then the legacy path when a D row says so, reporting the
 * failure the row names when the legacy path fails too.
 */
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
