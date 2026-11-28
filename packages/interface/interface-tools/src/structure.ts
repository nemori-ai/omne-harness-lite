import type { Structure, Until } from '@omne-harness/interface-protocol'

const MOST_LINES = 120

function depthOf(structure: Structure, index: number): number {
  let depth = 0
  for (let at = structure.parts[index]?.within ?? null; at !== null && depth < 64; depth += 1)
    at = structure.parts[at]?.within ?? null
  return depth
}

/** What was waited for and whether it came. */
export function waitedLine(until: Until | undefined, met: boolean): string[] {
  if (until === undefined) return []
  const what = `${until.part}${until.text === undefined ? '' : ` with ${JSON.stringify(until.text)}`}`
  return met
    ? [`waited for ${what}: it came`]
    : [
        `waited ${String(until.seconds)} s for ${what}: it did not come; this is what was drawn then`,
      ]
}

/** A structure as lines: the window and the page, what is open on top, then each part under its parent; at most 120 lines. */
export function structureLines(structure: Structure, part: string | undefined): string[] {
  const { width, height, page, parts, layers, more } = structure
  if (part !== undefined && parts.length === 0)
    return [
      `there is no part ${JSON.stringify(part)} drawn now. OmneExtensionPoints tree lists the parts.`,
    ]
  const head = `window ${String(width)}x${String(height)}   page ${page ?? 'not told'}   ${String(parts.length + more)} parts${part === undefined ? '' : ` in ${part}`}`
  const open = layers.map(
    layer =>
      `  ${layer.role}${layer.label === '' ? '' : ` ${JSON.stringify(layer.label)}`}   ${JSON.stringify(layer.text)}`,
  )
  const drawn = parts.map((each, index) => {
    const { x, y, w, h } = each.box
    const indent = '  '.repeat(depthOf(structure, index) + 1)
    const hidden = each.visible ? '' : '   hidden'
    const text = each.text === '' ? '' : `   ${JSON.stringify(each.text)}`
    return `${indent}${each.part}   ${String(x)},${String(y)} ${String(w)}x${String(h)}${hidden}${text}`
  })
  const lines = [head, ...(open.length === 0 ? [] : ['open on top:', ...open]), 'parts:', ...drawn]
  if (lines.length <= MOST_LINES && more === 0) return lines
  const kept = lines.slice(0, MOST_LINES - 1)
  const left = lines.length - kept.length + more
  return [
    ...kept,
    `… ${String(left)} more parts: give part=<name> to read one part and what is in it`,
  ]
}
