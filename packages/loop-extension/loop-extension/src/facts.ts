import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  MAX_ASSET_PAGE,
  collectCandidates,
  evaluate,
  listAssets,
  type AssetEntry,
} from '@omne-harness/assets'
import {
  LOOP_EXTENSION_CATEGORY,
  declarationOf as declarationOfBody,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import type { ExtensionFacts } from './view.ts'

type Sources = Pick<TenantExtensionSources, 'layers' | 'body' | 'run'>

/** How a version body gives its declaration; null when the body is not a declaration. */
export type DeclarationRead = (body: unknown) => LoopExtensionDeclaration | null

async function held(sources: Sources): Promise<readonly AssetEntry[] | 'unavailable'> {
  const entries: AssetEntry[] = []
  let after: string | null = null
  do {
    const answer = await listAssets(sources.layers, {
      category: LOOP_EXTENSION_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (answer.state !== 'read' || answer.page.completeness === 'partial') return 'unavailable'
    entries.push(...answer.page.items)
    after = answer.page.next
  } while (after !== null)
  return entries
}

async function factsOf(
  sources: Sources,
  entries: readonly AssetEntry[],
  declarationOf: DeclarationRead,
): Promise<ExtensionFacts> {
  const [first] = entries as [AssetEntry, ...AssetEntry[]]
  const { capability } = first
  const common = { capability: capability.name, assetRef: first.asset }
  if (entries.every(entry => !entry.enabled))
    return { ...common, holding: 'disabled', winner: { kind: 'none' }, run: { kind: 'absent' } }
  const layers = await collectCandidates(sources.layers, capability)
  const evaluation = evaluate({ layers, eligible: () => 'yes' })
  if (evaluation.kind !== 'winner')
    return {
      ...common,
      holding: 'enabled',
      winner: { kind: evaluation.kind },
      run: { kind: 'absent' },
    }
  const { asset, version } = evaluation.candidate
  const body = await sources.body({ asset, version }).catch(() => undefined)
  const run = await sources
    .run({ capability, asset })
    .catch((): ExtensionFacts['run'] => ({ kind: 'unavailable' }))
  const declaration = body === undefined ? null : declarationOf(body)
  return {
    capability: capability.name,
    assetRef: asset,
    holding: 'enabled',
    winner: { kind: 'version', version, declaration },
    run,
  }
}

/** What the sources say of every extension the tenant holds. An unreadable list is unavailable as a whole. */
export async function gatherFacts(
  sources: Sources,
  declarationOf: DeclarationRead = declarationOfBody,
): Promise<readonly ExtensionFacts[] | 'unavailable'> {
  const entries = await held(sources)
  if (entries === 'unavailable') return 'unavailable'
  const byName = new Map<string, AssetEntry[]>()
  for (const entry of entries)
    byName.set(entry.capability.name, [...(byName.get(entry.capability.name) ?? []), entry])
  return Promise.all([...byName.values()].map(group => factsOf(sources, group, declarationOf)))
}
