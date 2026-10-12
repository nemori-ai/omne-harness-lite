import type { ParameterDeclaration } from './types.ts'

interface Placeholder {
  readonly start: number
  readonly end: number
  readonly text: string
  readonly index?: bigint
  readonly escaped: boolean
}
export function placeholders(template: string): readonly Placeholder[] {
  const points = Array.from(template)
  const result: Placeholder[] = []
  for (let i = 0; i < points.length; i++) {
    if (points[i] !== '$') continue
    let end = i + 1
    let index: bigint | undefined
    if (points.slice(i, i + 10).join('') === '$ARGUMENTS') end = i + 10
    else {
      while (end < points.length && /^[0-9]$/u.test(points[end] ?? '')) end++
      if (end === i + 1) continue
      index = BigInt(points.slice(i + 1, end).join(''))
    }
    const escaped = points[i - 1] === '\\' && points[i - 2] !== '\\'
    result.push(
      Object.freeze({
        start: i,
        end,
        text: points.slice(i, end).join(''),
        ...(index === undefined ? {} : { index }),
        escaped,
      }),
    )
    i = end - 1
  }
  return Object.freeze(result)
}
export function templateLegal(
  template: string,
  parameters?: readonly ParameterDeclaration[],
): boolean {
  const active = placeholders(template).filter(item => !item.escaped)
  const positional = parameters?.filter(item => item.positional === true) ?? []
  if (active.some(item => item.index !== undefined && item.index >= BigInt(positional.length)))
    return false
  if (parameters === undefined || active.some(item => item.index === undefined)) return true
  if (parameters.some(item => item.positional !== true)) return false
  return positional.every((_, index) => active.some(item => item.index === BigInt(index)))
}
export function substitute(
  template: string,
  argumentText: string,
  positional: readonly string[],
  declared: boolean,
): string {
  const points = Array.from(template)
  const found = placeholders(template)
  let end = 0
  let result = ''
  for (const item of found) {
    result += points.slice(end, item.start - (item.escaped ? 1 : 0)).join('')
    result += item.escaped
      ? item.text
      : item.index === undefined
        ? argumentText
        : (positional[Number(item.index)] ?? '')
    end = item.end
  }
  result += points.slice(end).join('')
  if (
    !declared &&
    !found.some(item => !item.escaped && item.index === undefined) &&
    argumentText !== ''
  )
    result += `\n\nARGUMENTS: ${argumentText}`
  return result
}
