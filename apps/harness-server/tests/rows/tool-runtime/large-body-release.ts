import type { Context } from '@deepseek-ai/cordis'
import {
  toolBindingsKey,
  toolContributionAuthorityKey,
  toolGenerationsKey,
  toolResidencyReaderKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createLocalToolHostPlugin } from '@omne-harness/tool-host-local/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import { defineRow } from '../../../src/row.ts'
import { entryObjects } from '../../../src/entry/index.ts'
import { createToolReleaseEntries, loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { definitionDigest, governanceOf } from '../../../src/entry/tool-release-manifest.ts'
import { preloadRelease, toolHostConfig } from '../../../src/rows/tool-host/index.ts'
import { releaseAuthorInput } from '../../../src/rows/tool-host/release-author.ts'
import { tree } from '../tool-host/support.ts'
import { LARGE_TOOL, largeBodyModule } from './large-body-author.ts'

export function largeBodyRelease() {
  const entries = createToolReleaseEntries(async () => {
    const release = await loadProductionRelease()
    if (release.kind !== 'trusted') return release
    const base = release.manifest.entries.find(entry => entry.asset.name === 'Shell')
    if (base === undefined) throw new Error('release Shell missing')
    const entry = {
      ...base,
      asset: { name: LARGE_TOOL, adoption: largeBodyModule.executor },
      requiredCapabilities: [],
      construction: [],
      module: { ...base.module, export: 'largeBodyModule', executor: largeBodyModule.executor },
      settings: largeBodyModule.executor,
      holding: { ...base.holding, record: `test:${LARGE_TOOL}:holding` },
      publication: { ...base.publication, record: `test:${LARGE_TOOL}:publication` },
      definition: '',
    }
    entry.definition = definitionDigest(largeBodyModule, governanceOf(entry), tree({}))
    const generation = canonicalDigest({ production: release.manifest.generation, test: entry })
    const evidence = (record: string, content: unknown) => ({
      owner: 'w3-release-test',
      record: `test:${record}`,
      revision: generation,
      digest: canonicalDigest({ generation, record, content }),
    })
    return {
      ...release,
      generation,
      manifest: {
        ...release.manifest,
        generation,
        consumer: {
          ...release.manifest.consumer,
          capabilities: evidence('consumer/capabilities', release.manifest.consumer),
          attachmentAccess: evidence('consumer/attachment-access', release.manifest.consumer),
        },
        entries: [...release.manifest.entries, entry].map(item => ({
          ...item,
          holding: evidence(`${item.asset.name}/holding`, item),
          publication: evidence(`${item.asset.name}/publication`, item),
        })),
      },
      modules: { ...release.modules, largeBodyModule },
    }
  })
  return {
    entryObjects: entryObjects.map(entry =>
      entry.name === entries.registrant.name
        ? entries.registrant
        : entry.name === entries.authority.name
          ? entries.authority
          : entry,
    ),
    toolHostRow: defineRow({
      row: 'tool-host',
      implementation: 'real',
      manifest: {
        provides: [toolGenerationsKey],
        injects: [toolBindingsKey, toolContributionAuthorityKey, toolResidencyReaderKey],
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'tool-host',
        inject: [toolBindingsKey, toolContributionAuthorityKey, toolResidencyReaderKey],
        Config: toolHostConfig,
        apply(ctx: Context, config: unknown) {
          const { construction } = toolHostConfig.parse(config)
          const Host = createLocalToolHostPlugin(
            releaseAuthorInput(ctx, { ...construction, [LARGE_TOOL]: {} }),
          )
          const host = new Host(ctx)
          setImmediate(() => void preloadRelease(ctx, host))
        },
      },
    }),
  }
}

export function adoptLargeBody(release: unknown): unknown {
  const copy = structuredClone(release) as {
    rows: {
      id: string
      config: {
        mappings: { name: string; definition: { references: unknown[] } }[]
        actionRules: { revision: string; rules: unknown[] }
      }
    }[]
  }
  const coding = copy.rows
    .find(row => row.id === 'agent-adoptions')
    ?.config.mappings.find(mapping => mapping.name === 'coding')
  if (coding === undefined) throw new Error('coding adoption missing')
  coding.definition.references.push({
    capability: { category: 'Tool', name: LARGE_TOOL },
    resident: false,
  })
  const rules = copy.rows.find(row => row.id === 'authorization')?.config.actionRules
  if (rules === undefined) throw new Error('authorization rules missing')
  rules.revision = 'w3-large-body-test'
  rules.rules.push({
    id: 'w3-large-body',
    effect: 'allow',
    tool: LARGE_TOOL,
    definition: largeBodyModule.executor,
  })
  return copy
}
