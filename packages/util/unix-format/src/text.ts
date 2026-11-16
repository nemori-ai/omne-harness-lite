export function codePointLength(text: string): number {
  let length = 0
  for (const _ of text) length += 1
  return length
}

export function sliceCodePoints(text: string, count: number): string {
  let result = ''
  let taken = 0
  for (const char of text) {
    if (taken >= count) break
    result += char
    taken += 1
  }
  return result
}

export function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - codePointLength(text)))
}

export function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - codePointLength(text))) + text
}

export function indentLines(text: string, prefix: string): string {
  if (prefix === '') return text
  return text
    .split('\n')
    .map(line => (line.trim() === '' ? line : prefix + line))
    .join('\n')
}
