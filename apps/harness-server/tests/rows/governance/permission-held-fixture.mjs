import { assetsPublicationFact } from '@omne-harness/assets-local'
import { settingsAssetsProjectionFact } from '@omne-harness/settings-local'

/** The held-asset facts of a capture that names no asset: what the release participant reads first. */
export const NO_HELD_ASSETS = {
  binding: {
    domain: { scope: { kind: 'tenant', tenant: 'tenant-a' }, transactionDomain: 'permissions' },
    principalRef: 'fixture',
    captureId: 'fixture-capture',
    request: { deploymentRef: 'fixture', mode: 'runtime', targets: [], selectionRef: null },
  },
  views: [],
}

export const heldFacts = [assetsPublicationFact, settingsAssetsProjectionFact]

export default {
  participant: 'fixture.permission-held',
  protocol: '1',
  execute(_facts, port) {
    for (const fact of heldFacts) port.provideFact(fact, NO_HELD_ASSETS)
    return { kind: 'participated', response: null }
  },
}
