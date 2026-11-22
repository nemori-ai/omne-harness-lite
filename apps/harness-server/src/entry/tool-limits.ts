import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { evaluateSettings } from '@omne-harness/settings'
import { backgroundAllowed } from '@omne-harness/tool'
import type { FixedToolRequest, ToolInvokeRequest } from '@omne-harness/tool-contract'
import { officialHolding, toolAsset } from '../assets/official-holdings.ts'

/** Settings items that, when a tool declares them, give the time limits of its calls. */
export const FOREGROUND_ITEM = 'foregroundMs'
export const BACKGROUND_AFTER_ITEM = 'backgroundAfterMs'
const OPERATOR_SOURCE = 'operator'

type Limits = Pick<ToolInvokeRequest['limits'], 'foregroundMs' | 'backgroundAfterMs'>
const NONE: Limits = { foregroundMs: null, backgroundAfterMs: null }

function milliseconds(
  entries: Extract<ReturnType<typeof evaluateSettings>, { kind: 'complete' }>['entries'],
  item: string,
): number | null {
  const value = entries.find(entry => entry.itemId === item)?.value
  return value?.kind === 'value' && typeof value.value === 'number' ? value.value : null
}

// The limits of one call, read before admission: the threshold only for a call that may go to
// the background, the foreground limit for any. Unreadable settings admit nothing.
export function toolLimitsOf(
  request: Pick<FixedToolRequest, 'availability' | 'command' | 'arguments'>,
  operator: () => Readonly<Record<string, unknown>> | undefined,
): Outcome<Limits, string> {
  const { definition } = request.availability
  if (definition.declarations.settings === null) return succeed(NONE)
  const given = operator()
  if (given === undefined) return fail('the operator settings of the release tools are absent')
  let held: ReturnType<typeof officialHolding>
  try {
    held = officialHolding(toolAsset(definition))
  } catch {
    return fail(`the settings ${definition.name} declares cannot be read`)
  }
  if (held.kind !== 'declared')
    return fail(`the settings ${definition.name} declares are ${held.kind}`)
  const values = Object.entries(given).map(([itemId, value]) => ({
    itemId,
    value: { kind: 'value' as const, value: value as JsonValue },
    locked: false,
  }))
  const evaluated = evaluateSettings({
    definition: held.definition,
    sources: [{ id: OPERATOR_SOURCE, values }],
  })
  if (evaluated.kind !== 'complete')
    return fail(`the settings of ${definition.name} answered ${evaluated.kind}`)
  return succeed({
    foregroundMs: milliseconds(evaluated.entries, FOREGROUND_ITEM),
    backgroundAfterMs: backgroundAllowed(request)
      ? milliseconds(evaluated.entries, BACKGROUND_AFTER_ITEM)
      : null,
  })
}
