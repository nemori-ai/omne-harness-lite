import { canonicalDigest } from '@omne-harness/tool'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import type { TargetSnapshot } from '../../../src/rows/governance/target-snapshot.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
const entry = release.manifest.entries.find(value => value.asset.name === 'Shell')
if (!entry) throw new Error('Shell release missing')
const declaration = entry.governance.declaration
const definition = declaration.settings[0]!

export function settingsSnapshotFixture() {
  const target = { policyId: 'asset', scopeRef: 'tenant-a', targetRef: 'shell' }
  const snapshot: TargetSnapshot = {
    binding: {
      scope: {
        tenantRef: 'tenant-a',
        deploymentId: 'test',
        logicalServiceId: 'tools',
        visibility: { kind: 'tenant', tenantRef: 'tenant-a' },
      },
      epoch: 'epoch',
      mode: 'management',
      principalRef: 'alice',
      captureId: 'capture',
      transactionDomain: 'governance',
      definition: declaration.reference,
      target,
    },
    declaration: structuredClone(declaration),
    declarationRevision: 1,
    adoptionRevision: 0,
    declarationSetDigest: 'a'.repeat(64),
    enforcementBindings: declaration.enforcementBindings,
    values: {
      presence: 'absent',
      view: {
        target,
        enabled: true,
        definition: structuredClone(definition),
        definitionRef: {
          providerId: definition.providerId,
          definitionId: definition.definitionId,
          version: definition.version,
          digest: canonicalDigest(definition).slice(7),
        },
        ownerRevision: 1,
        sources: [
          {
            sourceId: 'tenant',
            ownerRef: 'target-owner',
            scope: { kind: 'tenant', subjectRef: 'tenant-a' },
            authorityRevision: '1',
          },
        ],
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
        state: { revision: 0, sources: [{ id: 'tenant', values: [] }] },
      },
    },
  }
  return {
    snapshot,
    configuration: {
      destination: 'settings.preparation',
      required: [],
      sourceRoute: 'settings.preparation',
    },
  }
}
