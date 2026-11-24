import type { ToolCatalog } from '@omne-harness/tool-contract'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import {
  constructionTree,
  governanceOf,
  type ToolReleaseManifest,
} from '../../../src/entry/tool-release-manifest.ts'
import type { loadProductionRelease } from '../../../src/entry/tool-release.ts'

type Trusted = Extract<Awaited<ReturnType<typeof loadProductionRelease>>, { kind: 'trusted' }>

// Definitions do not depend on construction values (the release script proves it); any legal one serves.
const CONSTRUCTION: Readonly<Record<string, unknown>> = {
  Shell: { resultMaxBytes: 1, executable: 'probe', argsPrefix: [], env: {} },
  Files: {
    resultMaxBytes: 1,
    openMaxBytes: 1,
    imageMaxWidth: 1,
    imageMaxHeight: 1,
    imageMaxDecodedBytes: 1,
    imageConcurrency: 1,
  },
  Tools: { resultMaxBytes: 4096, outputModalities: ['text'] },
  TodoItems: { resultMaxBytes: 4096 },
  BkgToolCalls: { resultMaxBytes: 4096 },
  Ask: { resultMaxBytes: 4096 },
  Web: { resultMaxBytes: 1, maxSearchResults: 1 },
  Skills: { resultMaxBytes: 4096 },
  Calendar: { resultMaxBytes: 16 },
  Schedules: { resultMaxBytes: 64 },
  Jobs: { resultMaxBytes: 64 },
  Notifications: { resultMaxBytes: 64 },
  Canvas: { resultMaxBytes: 64 },
  Sessions: { resultMaxBytes: 4096 },
  Agents: { resultMaxBytes: 4096 },
  SwitchWorkspace: { resultMaxBytes: 4096 },
  OmneExtensionPoints: { resultMaxBytes: 4096 },
  OmneExtensions: { resultMaxBytes: 4096 },
  Screen: {
    resultMaxBytes: 4096,
    captureMaxLongSide: 2048,
    imageMaxWidth: 4096,
    imageMaxHeight: 4096,
    imageMaxDecodedBytes: 67_108_864,
    imageConcurrency: 2,
  },
}

function definitionOf(release: Trusted, entry: ToolReleaseManifest['entries'][number]) {
  const module = release.modules[entry.module.export as keyof Trusted['modules']]
  const construction = constructionTree(CONSTRUCTION[entry.asset.name])
  if (construction === undefined) throw new Error(`${entry.asset.name}: construction`)
  const created = module.createAuthor(construction)
  if ('failure' in created) throw new Error(`${entry.asset.name}: ${created.failure.field}`)
  const judged = judgeToolDefinition(deriveDefinition(governanceOf(entry), created.ok.facts))
  if ('failure' in judged) throw new Error(`${entry.asset.name}: ${judged.failure.field}`)
  return judged.ok
}

/** A catalog that offers every released tool as released, official and available. */
export function releaseCatalog(release: Trusted): ToolCatalog<unknown> {
  const offered = new Map(
    release.manifest.entries.map(entry => [
      entry.asset.name,
      {
        kind: 'available' as const,
        definition: definitionOf(release, entry),
        executor: entry.module.executor,
        layer: { kind: 'official' as const },
      },
    ]),
  )
  return {
    inspect: async input => {
      const found = offered.get(input.name)
      return found === undefined
        ? { failure: { kind: 'denied', action: 'inspect' } }
        : { ok: structuredClone(found) }
    },
  } as ToolCatalog<unknown>
}
