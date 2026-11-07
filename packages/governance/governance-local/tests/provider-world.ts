import type { GovernanceLocalOptions } from '@omne-harness/governance-local'
import { openRegistrarWorld } from './registrar-world.ts'
import { json } from '../src/encoding.ts'

export async function openProviderWorld() {
  const w = await openRegistrarWorld()
  const definition = w.command('definition').declaration
  function combination(mode: Parameters<typeof w.activation.combination>[0]) {
    const { combinationVersion, manifestDigest } = w.activation.combination(mode)
    return { combinationVersion, manifestDigest }
  }
  const options: GovernanceLocalOptions = {
    storage: w.activation.storage,
    domain: w.activation.domain,
    scope: w.scope,
    metadata: combination('metadata'),
    destination: w.destination,
    identity: {
      verifier: w.verifier,
      standing: w.identity.standing,
      reservations: w.identity.reservations,
    },
    grants: [
      {
        principalRef: w.principalRef,
        scope: w.scope,
        action: 'contribute',
        required: [],
        owners: [
          {
            ownerId: definition.reference.ownerId,
            enforcementBindings: definition.enforcementBindings,
          },
        ],
      },
      ...(
        ['withdraw', 'adopt', 'operation-read', 'catalog-management', 'catalog-runtime'] as const
      ).map(action => ({ principalRef: w.principalRef, scope: w.scope, action, required: [] })),
    ],
    definitions: {
      async resolve() {
        return { kind: 'definition', declaration: definition }
      },
    },
    combinations: {
      mutation: combination('mutation'),
      adoption: combination('adoption'),
      catalog: combination('catalog'),
    },
    current: {
      adoption: input => [
        {
          participant: 'fixture.governance-current',
          facts: {
            evidence: json({
              binding: input.binding,
              epoch: input.epoch,
              transactionDomain: w.activation.domain.transactionDomain,
              targets: [],
              enforcementBindings: definition.enforcementBindings,
            }),
          },
        },
      ],
      catalog: binding => [
        {
          participant: 'fixture.governance-catalog-current',
          facts: {
            evidence: json({
              binding,
              epoch: binding.epoch,
              transactionDomain: w.activation.domain.transactionDomain,
              targets: [],
              enforcementBindings: definition.enforcementBindings,
              unavailableOwners: [],
            }),
          },
        },
      ],
    },
    closeTimeoutMs: 3000,
    recoveryPagesPerPass: 4,
  }
  return { w, options, definition }
}
