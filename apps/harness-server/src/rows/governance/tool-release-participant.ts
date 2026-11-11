import { z } from 'zod'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { loadProductionRelease } from '../../entry/tool-release.ts'
import { GOVERNANCE_PUBLICATIONS } from './current-publications.ts'
import { toolAssetPublication } from './tool-assets.ts'
import { PERMISSION_RELEASES } from './permission-protocol.ts'

const generation = new URL(import.meta.url).searchParams.get('release')
const release = await loadProductionRelease()

export default {
  participant: 'harness.tool-permission-release',
  protocol: `harness-tool-permission-release/1/${generation ?? 'unbound'}`,
  execute(_facts, port) {
    if (release.kind !== 'trusted' || release.generation !== generation)
      return { kind: 'unsupported', basis: { reason: 'tool-release-unavailable' } }
    port.provideFact(
      PERMISSION_RELEASES,
      release.manifest.entries.flatMap(entry => entry.governance.interpretations),
    )
    port.provideFact(
      GOVERNANCE_PUBLICATIONS,
      z.json().parse(
        release.manifest.entries.map(entry => ({
          publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
          declaration: entry.governance.declaration,
        })),
      ),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
