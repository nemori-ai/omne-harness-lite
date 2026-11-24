import {
  type AssetLayerSource,
  type Candidate,
  capabilityId,
  collectCandidates,
  evaluate,
  type JsonValue,
  listAssets,
  MAX_ASSET_PAGE,
} from '@omne-harness/assets'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import { isName } from '@omne-harness/slash-command-contract'
import { PROMPT_CATEGORY, promptOf } from './contract.ts'
import type { PromptHolding } from './source.ts'

/** The asset layers one asker reads prompt commands from, as the assets give them. */
export type PromptLayers = Readonly<{
  sources: readonly AssetLayerSource[]
  body(candidate: Candidate): Promise<JsonValue | undefined>
}>

type One = Outcome<PromptHolding | null, 'unavailable'>

/** The prompt command of one name in force for these layers, by the assets' own rule of layers. */
export async function onePrompt(layers: PromptLayers, name: string): Promise<One> {
  const id = capabilityId(PROMPT_CATEGORY, name)
  if (!isName(name) || name.includes(':') || !id.ok) return succeed(null)
  const answer = evaluate({
    layers: await collectCandidates(layers.sources, id.id),
    eligible: () => 'yes',
  })
  if (answer.kind === 'unavailable') return fail('unavailable')
  if (answer.kind === 'none')
    return succeed(
      answer.filtered.some(out => out.reason === 'disabled') ? { kind: 'disabled', name } : null,
    )
  const body = await layers.body(answer.candidate)
  if (body === undefined) return fail('unavailable')
  const prompt = promptOf(body)
  if (prompt?.name !== name) return succeed(null)
  const { version } = answer.candidate
  return succeed({
    kind: 'in-force',
    body: prompt,
    from: { layer: answer.layer, version, digest: version },
  })
}

/** Every prompt command the layers hold, each as the one in force; one that cannot be read leaves the whole unknown. */
export async function heldPrompts(
  layers: PromptLayers,
): Promise<Outcome<readonly PromptHolding[], 'unavailable'>> {
  const names = new Set<string>()
  let after: string | null = null
  do {
    const page = await listAssets(layers.sources, {
      category: PROMPT_CATEGORY,
      after,
      limit: MAX_ASSET_PAGE,
    })
    if (page.state !== 'read' || page.page.completeness === 'partial') return fail('unavailable')
    for (const item of page.page.items) names.add(item.capability.name)
    after = page.page.next
  } while (after !== null)
  const held: PromptHolding[] = []
  for (const name of [...names].sort()) {
    const one = await onePrompt(layers, name)
    if (!('ok' in one)) return one
    if (one.ok !== null) held.push(one.ok)
  }
  return succeed(held)
}
