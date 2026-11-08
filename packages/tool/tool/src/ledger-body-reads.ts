import type { Outcome } from '@omne-harness/operation-result'
import type { ContentPage, Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import type { ToolBodyReader } from '@omne-harness/tool-contract/provider'
import type { CallInput } from './boundary.ts'
import type { ToolLedgerPorts, ToolOffloadingConfiguration } from './construction.ts'
import { admitBodyPage, bodyReply, finishBodyPage, type BodyGrant } from './ledger-body-lease.ts'
import {
  bodyUnavailable,
  fixBodyRead,
  readBodyText,
  readBodyBytes,
  type BodyReadInput,
  type BodyProjection,
  type StoredBody,
} from './ledger-body-page.ts'
import type { Decision, Mint, Snapshot } from './ledger-decider.ts'
import type { LedgerDomain } from './ledger-store.ts'
import { readBodyRecords } from './ledger-body-records.ts'

type BodyTransaction = <T>(
  domain: LedgerDomain,
  operation: ToolOperationId | null,
  decide: (snapshot: Snapshot, mint: Mint) => Promise<Decision<T>>,
  unknown: Outcome<T, ToolFailure>,
) => Reply<T>

export function createLedgerBodyReads<P>(
  ports: Readonly<{
    materials: ToolLedgerPorts<P>['materials']
    configuration: ToolOffloadingConfiguration
    authorize(input: CallInput<P>): Reply<void>
    transact: BodyTransaction
  }>,
): ToolBodyReader<P> & Readonly<{ bytes(input: BodyReadInput<P>): Reply<ContentPage> }> {
  async function read<T>(
    supplied: BodyReadInput<P>,
    projection: BodyProjection,
    materialRead: (
      input: BodyReadInput<P>,
      body: StoredBody,
      position: BodyGrant['position'],
      ports: Parameters<typeof readBodyText<P>>[3],
    ) => Reply<T>,
  ): Reply<T> {
    const fixed = fixBodyRead<P>(supplied)
    if ('failure' in fixed) return fixed
    const input = fixed.ok
    const allowed = await ports.authorize(input)
    if ('failure' in allowed) return allowed
    const materials = ports.materials
    if (materials === undefined) return bodyUnavailable('material provider is not connected')
    const domain = { kind: 'call', tenant: input.tenant, call: input.call } as const
    const admitted = await ports.transact<Outcome<BodyGrant, ToolFailure>>(
      domain,
      null,
      async (snapshot, mint) => {
        const qualified = await ports.authorize(input)
        return 'failure' in qualified
          ? bodyReply(qualified)
          : admitBodyPage(snapshot, mint, input, ports.configuration, materials.clock, projection)
      },
      bodyUnavailable('page admission commit is unknown'),
    )
    if ('failure' in admitted) return admitted
    const outcome = admitted.ok
    if ('ok' in outcome) {
      const grant = outcome.ok
      const page = await materialRead(input, grant.body, grant.position, {
        store: materials.store,
        maxBytes: Math.min(input.maxBytes, ports.configuration.maxPageBytes),
        authorize: () => ports.authorize(input),
      })
      const finished = await ports.transact<Outcome<T, ToolFailure>>(
        domain,
        null,
        async snapshot => {
          const qualified = await ports.authorize(input)
          return 'failure' in qualified
            ? bodyReply(qualified)
            : finishBodyPage(snapshot, input, grant, page, materials.clock)
        },
        bodyUnavailable('page completion commit is unknown'),
      )
      if ('failure' in finished) return finished
      const current = await ports.authorize(input)
      return 'failure' in current ? current : finished.ok
    }
    const current = await ports.authorize(input)
    return 'failure' in current ? current : outcome
  }
  return {
    read: input =>
      read(input, 'text-utf8-v1', (request, body, position, access) =>
        body.description.representation.kind === 'json-lines'
          ? readBodyRecords(request, body, position, access)
          : readBodyText(request, body, position, access),
      ),
    bytes: input => read(input, 'body-bytes-v1', readBodyBytes),
  }
}
