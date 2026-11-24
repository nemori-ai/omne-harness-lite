import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  AssetsPublicationProjectionSchema,
  assetsPublicationFact,
} from '@omne-harness/assets-local'
import { canonicalText } from '@omne-harness/authorization'
import {
  SettingsOwnerProjectionSchema,
  settingsAssetsProjectionFact,
} from '@omne-harness/settings-local'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { storedCategoryGateRelease } from '../../entry/category-gates.ts'
import { TOOL_GOVERNANCE_OWNER } from '../../entry/tool-permission-release.ts'
import {
  TOOL_RELEASE_MANIFEST_PATH,
  manifestGeneration,
  manifestSchema,
  type ToolReleaseManifest,
} from '../../entry/tool-release-manifest.ts'
import { GOVERNANCE_PUBLICATIONS } from './current-publications.ts'
import {
  GOVERNED_PARTICIPANT,
  governedProtocol,
  type GovernedCategoryCapability,
} from './governed-capabilities.ts'
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

function heldCapabilities(
  publications: z.infer<typeof AssetsPublicationProjectionSchema>,
  settings: z.infer<typeof SettingsOwnerProjectionSchema>,
): GovernedCategoryCapability[] {
  const held: GovernedCategoryCapability[] = []
  for (const view of publications.views) {
    if (view.publicationRef.source === TOOL_GOVERNANCE_OWNER) continue
    const target = canonicalText(view.target)
    const stored = settings.views.filter(candidate => canonicalText(candidate.target) === target)
    const [current] = stored
    if (stored.length !== 1 || current === undefined) continue
    const derived = storedCategoryGateRelease(view.publicationRef, current.definition)
    if (derived === undefined) continue
    held.push({
      template: derived.template,
      target: view.target,
      enabled: current.enabled,
      publication: { kind: 'asset', reference: view.publicationRef },
      declaration: derived.release.declaration,
      interpretations: derived.release.interpretations,
    })
  }
  return held
}

export default {
  participant: GOVERNED_PARTICIPANT,
  protocol: governedProtocol(generation ?? 'unbound'),
  execute(_facts, port) {
    if (manifest === null)
      return { kind: 'unsupported', basis: { reason: 'tool-release-unavailable' } }
    const publications = AssetsPublicationProjectionSchema.safeParse(
      port.requireFact(assetsPublicationFact),
    )
    const settings = SettingsOwnerProjectionSchema.safeParse(
      port.requireFact(settingsAssetsProjectionFact),
    )
    if (!publications.success || !settings.success)
      return { kind: 'unsupported', basis: { reason: 'held-assets-unavailable' } }
    const held = heldCapabilities(publications.data, settings.data)
    port.provideFact(PERMISSION_RELEASES, [
      ...manifest.entries.flatMap(entry => entry.governance.interpretations),
      ...held.flatMap(capability => capability.interpretations),
    ])
    port.provideFact(
      GOVERNANCE_PUBLICATIONS,
      z.json().parse([
        ...manifest.entries.map(entry => ({
          publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
          declaration: entry.governance.declaration,
        })),
        ...held.map(({ publication, declaration }) => ({ publication, declaration })),
      ]),
    )
    return { kind: 'participated', response: z.json().parse(held) }
  },
} satisfies ParticipantModule
