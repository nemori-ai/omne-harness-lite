import type { PinnedBody } from './adoption.ts'
import type { CategoryView } from './category-point.ts'

export type AssetSummaryFact = Readonly<{ name: string; text: string }>

export type AssetSummary = Readonly<{
  title: string
  description: string
  facts: readonly AssetSummaryFact[]
}>

export const SUMMARY_LIMITS = Object.freeze({
  title: 120,
  description: 500,
  facts: 8,
  name: 40,
  text: 200,
})

function clip(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const points = [...value]
  return points.length > limit ? points.slice(0, limit).join('') : value
}

function factOf(value: unknown): AssetSummaryFact | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { name, text } = value as Record<string, unknown>
  const clippedName = clip(name, SUMMARY_LIMITS.name)
  const clippedText = clip(text, SUMMARY_LIMITS.text)
  if (clippedName === undefined || clippedText === undefined) return undefined
  return Object.freeze({ name: clippedName, text: clippedText })
}

/** What a category's `summarize` returned, clipped to the bounds; `null` when the shape is wrong. */
export function admitSummary(value: unknown): AssetSummary | null {
  if (typeof value !== 'object' || value === null) return null
  const { title, description, facts } = value as Record<string, unknown>
  const clippedTitle = clip(title, SUMMARY_LIMITS.title)
  const clippedDescription = clip(description, SUMMARY_LIMITS.description)
  if (clippedTitle === undefined || clippedDescription === undefined || !Array.isArray(facts))
    return null
  const admitted = facts.slice(0, SUMMARY_LIMITS.facts).map(factOf)
  if (admitted.some(fact => fact === undefined)) return null
  return Object.freeze({
    title: clippedTitle,
    description: clippedDescription,
    facts: Object.freeze(admitted as AssetSummaryFact[]),
  })
}

/** The summary a version gets when it is published; a failing `summarize` never blocks the publish. */
export function summarizeVersion(
  categories: Pick<CategoryView, 'lookup'>,
  pinned: PinnedBody,
): AssetSummary | null {
  const summarize = categories.lookup(pinned.identity.category)?.summarize
  if (summarize === undefined) return null
  try {
    const context = { capabilityName: pinned.identity.name, definition: pinned.version }
    return admitSummary(summarize(pinned.body, context))
  } catch {
    return null
  }
}
