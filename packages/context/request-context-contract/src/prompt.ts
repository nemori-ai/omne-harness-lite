import type { ContentBlock } from '@omne-harness/content-block'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  AssemblyContext,
  Coverage,
  PromptContribution,
  PromptContributionSet,
} from './values.js'
import { digest, textBlock } from './internal.js'
export type SystemPromptResult =
  | Readonly<{
      kind: 'rendered'
      blocks: readonly ContentBlock[]
      sections: Coverage['prompt']['sections']
      digest: string
    }>
  | Readonly<{
      kind: 'invalid'
      reason: 'per-request-variable' | 'duplicate-name' | 'unknown-variable'
      name: string
      scope: ScopeRef | null
    }>
export function assembleSystemPrompt(
  set: PromptContributionSet,
  context: AssemblyContext,
): SystemPromptResult {
  const selection = selectContributions(set, context)
  if (selection.kind === 'invalid') return selection
  const selected = selection.selected
  const sections = [...selected.values()]
    .filter(x => x.kind === 'section')
    .sort((a, b) =>
      a.order < b.order ? -1 : a.order > b.order ? 1 : a.name.localeCompare(b.name, 'en'),
    )
  const rendered: string[] = []
  for (const section of sections) {
    const invalid = validateSectionVariables(section, selected)
    if (invalid !== null) return invalid
    rendered.push(
      section.template.replace(/\{\{([^{}]+)\}\}/gu, (_match: string, name: string) => {
        const variable = selected.get(name)
        return variable?.kind === 'variable' ? variable.value : ''
      }),
    )
  }
  const text = rendered.join('\n')
  return {
    kind: 'rendered',
    blocks: sections.length ? [textBlock(text, { layer: 'system-prompt', text })] : [],
    sections: sections.map(({ name, scope, source, revision }) => ({
      name,
      scope,
      source,
      revision,
    })),
    digest: digest(text),
  }
}

function selectContributions(
  set: PromptContributionSet,
  context: AssemblyContext,
):
  | Extract<SystemPromptResult, { kind: 'invalid' }>
  | Readonly<{ kind: 'selected'; selected: ReadonlyMap<string, PromptContribution> }> {
  const selected = new Map<string, PromptContribution>()
  const seen = new Set<string>()
  for (const item of set.contributions) {
    if (item.scope !== null && item.scope.ref !== context.scope.ref) continue
    const key = `${item.scope?.ref ?? 'global'}:${item.name}`
    if (seen.has(key))
      return { kind: 'invalid', reason: 'duplicate-name', name: item.name, scope: item.scope }
    seen.add(key)
    if (!selected.has(item.name) || item.scope !== null) selected.set(item.name, item)
  }
  return { kind: 'selected', selected }
}
function validateSectionVariables(
  section: Extract<PromptContribution, { kind: 'section' }>,
  selected: ReadonlyMap<string, PromptContribution>,
): Extract<SystemPromptResult, { kind: 'invalid' }> | null {
  const referenced = [...section.template.matchAll(/\{\{([^{}]+)\}\}/gu)].map(m => m[1] ?? '')
  for (const name of new Set([...section.uses, ...referenced])) {
    const variable = selected.get(name)
    if (!section.uses.includes(name) || variable?.kind !== 'variable')
      return { kind: 'invalid', reason: 'unknown-variable', name, scope: section.scope }
    if (variable.volatility === 'per-request')
      return { kind: 'invalid', reason: 'per-request-variable', name, scope: section.scope }
  }
  return null
}
