import type { FacilityResult, FileIdentity } from '@omne-harness/execution-environment-contract'

const encoder = new TextEncoder()
export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength
}
function prefix(text: string, maximum: number): string {
  let size = 0
  let result = ''
  for (const char of text) {
    const bytes = utf8Length(char)
    if (size + bytes > maximum) break
    result += char
    size += bytes
  }
  return result
}
function suffix(text: string, maximum: number): string {
  return [...prefix([...text].reverse().join(''), maximum)].reverse().join('')
}
/** UTF-8 byte ranges refer to the complete unbounded tool text. */
export function bounded(text: string, maximum: number): string {
  const total = utf8Length(text)
  if (total <= maximum) return text
  const reserve = utf8Length(`\n[tool truncated bytes 0..${total} of ${total}]\n`)
  if (reserve >= maximum) return prefix('[tool truncated]', maximum)
  const budget = maximum - reserve
  const head = prefix(text, Math.ceil(budget / 2))
  const tail = suffix(text, Math.floor(budget / 2))
  const start = utf8Length(head)
  const end = total - utf8Length(tail)
  return `${head}\n[tool truncated bytes ${start}..${end} of ${total}]\n${tail}`
}
export class TextWindow {
  private head = ''
  private tail = ''
  private total = 0
  private readonly maximum: number
  constructor(maximum: number) {
    this.maximum = maximum
  }
  append(text: string): void {
    this.total += utf8Length(text)
    this.head = prefix(this.head + text, this.maximum)
    this.tail = suffix(this.tail + text, this.maximum)
  }
  render(maximum: number): string {
    if (this.total <= maximum) return this.head
    const reserve = utf8Length(`\n[tool truncated bytes 0..${this.total} of ${this.total}]\n`)
    if (reserve >= maximum) return prefix('[tool truncated]', maximum)
    const budget = maximum - reserve
    const head = prefix(this.head, Math.ceil(budget / 2))
    const tail = suffix(this.tail, Math.floor(budget / 2))
    return `${head}\n[tool truncated bytes ${utf8Length(head)}..${this.total - utf8Length(tail)} of ${this.total}]\n${tail}`
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
