import type { FacilityResult, FileIdentity } from '@omne-harness/execution-environment-contract'

/** Older providers may omit this observation; never infer it from an object token. */
export function writeEffectOf(value: object): string {
  if (!('writeEffect' in value)) return 'unreported'
  const effect = value.writeEffect
  return effect === 'created' || effect === 'in-place' || effect === 'replaced'
    ? effect
    : 'unreported'
}

export function utf8Length(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}
function codePointBytes(code: number): number {
  return code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
}
function prefix(text: string, maximum: number): string {
  let size = 0
  let end = 0
  for (const char of text) {
    const bytes = codePointBytes(char.codePointAt(0)!)
    if (size + bytes > maximum) break
    end += char.length
    size += bytes
  }
  return text.slice(0, end)
}
function suffix(text: string, maximum: number): string {
  let size = 0
  let start = text.length
  while (start > 0) {
    let units = 1
    const last = text.charCodeAt(start - 1)
    if (last >= 0xdc00 && last <= 0xdfff && start > 1) {
      const previous = text.charCodeAt(start - 2)
      if (previous >= 0xd800 && previous <= 0xdbff) units = 2
    }
    const bytes = units === 2 ? 4 : codePointBytes(last)
    if (size + bytes > maximum) break
    start -= units
    size += bytes
  }
  return text.slice(start)
}
function truncateText(headText: string, tailText: string, total: number, maximum: number): string {
  let reserve = utf8Length(`\n[tool truncated bytes 0..${total} of ${total}]\n`)
  while (reserve < maximum) {
    const budget = maximum - reserve
    const head = prefix(headText, Math.ceil(budget / 2))
    const tail = suffix(tailText, Math.floor(budget / 2))
    const start = utf8Length(head)
    const end = total - utf8Length(tail)
    const output = `${head}\n[tool truncated bytes ${start}..${end} of ${total}]\n${tail}`
    const excess = utf8Length(output) - maximum
    if (excess <= 0) return output
    reserve += excess
  }
  return prefix('[tool truncated]', maximum)
}
/** UTF-8 byte ranges refer to the complete unbounded tool text. */
export function bounded(text: string, maximum: number): string {
  const total = utf8Length(text)
  return total <= maximum ? text : truncateText(text, text, total, maximum)
}
export class TextWindow {
  private head = ''
  private tail = ''
  private total = 0
  private remainingHead: number
  private tailBytes = 0
  private readonly maximum: number
  constructor(maximum: number) {
    this.maximum = maximum
    this.remainingHead = maximum
  }
  append(text: string): void {
    const bytes = utf8Length(text)
    this.total += bytes
    if (this.remainingHead > 0) {
      this.head += bytes <= this.remainingHead ? text : prefix(text, this.remainingHead)
      this.remainingHead = Math.max(0, this.remainingHead - bytes)
    }
    if (this.tailBytes + bytes <= this.maximum) {
      this.tail += text
      this.tailBytes += bytes
    } else {
      this.tail =
        bytes >= this.maximum
          ? suffix(text, this.maximum)
          : suffix(this.tail, this.maximum - bytes) + text
      this.tailBytes = utf8Length(this.tail)
    }
  }
  render(maximum: number): string {
    if (this.total <= maximum) return this.head
    return truncateText(this.head, this.tail, this.total, maximum)
  }
}
export function identityText(value: FileIdentity): string {
  return `version=${JSON.stringify(value.version)} object=${JSON.stringify(value.object)} handle=${JSON.stringify(value.handle)}`
}
export function confirmation<T>(result: FacilityResult<T>, render: (value: T) => string): string {
  return result.kind === 'done'
    ? `done request=${JSON.stringify(result.requestId)}\n${render(result.value)}`
    : `${result.kind} request=${JSON.stringify(result.requestId)}${result.kind === 'rejected' ? ` reason=${result.reason}` : ''}`
}
function lines(text: string, marker: string): string {
  if (text.length === 0) return ''
  const parts = text.split('\n')
  const ended = parts.at(-1) === ''
  if (ended) parts.pop()
  return (
    parts.map(line => `${marker}${line}\n`).join('') +
    (ended ? '' : '\\ No newline at end of file\n')
  )
}
export function diff(path: string, before: string, after: string, version: string): string {
  return `--- ${path} version=${JSON.stringify(version)}\n+++ ${path} planned\n@@ -1,${before.split('\n').length} +1,${after.split('\n').length} @@\n${lines(before, '-')}${lines(after, '+')}`
}
