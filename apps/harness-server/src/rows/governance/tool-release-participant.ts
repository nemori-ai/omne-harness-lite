import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  TOOL_RELEASE_MANIFEST_PATH,
  manifestGeneration,
  manifestSchema,
  type ToolReleaseManifest,
} from '../../entry/tool-release-manifest.ts'
import { GOVERNANCE_PUBLICATIONS } from './current-publications.ts'
import { toolAssetPublication } from './tool-assets.ts'
import { PERMISSION_RELEASES } from './permission-protocol.ts'

const generation = new URL(import.meta.url).searchParams.get('release')

async function pinnedManifest(): Promise<ToolReleaseManifest | null> {
  try {
    const parsed = manifestSchema.safeParse(
      JSON.parse(await readFile(TOOL_RELEASE_MANIFEST_PATH, 'utf8')),
    )
    return parsed.success && manifestGeneration(parsed.data) === generation ? parsed.data : null
  } catch {
    return null
  }
}

const manifest = await pinnedManifest()

export default {
  participant: 'harness.tool-permission-release',
  protocol: `harness-tool-permission-release/1/${generation ?? 'unbound'}`,
  execute(_facts, port) {
    if (manifest === null)
      return { kind: 'unsupported', basis: { reason: 'tool-release-unavailable' } }
    port.provideFact(
      PERMISSION_RELEASES,
      manifest.entries.flatMap(entry => entry.governance.interpretations),
    )
    port.provideFact(
      GOVERNANCE_PUBLICATIONS,
      z.json().parse(
        manifest.entries.map(entry => ({
          publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
          declaration: entry.governance.declaration,
        })),
      ),
    )
    return { kind: 'participated', response: null }
  },
} satisfies ParticipantModule
