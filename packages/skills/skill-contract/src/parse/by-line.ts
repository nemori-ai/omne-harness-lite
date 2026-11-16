export type LineFields = Readonly<{ name?: string; description?: string }>

const KEY_LINE = /^(name|description):(?:[ \t]+(.*))?$/
const CONTINUATION = /^[ \t]+\S/

function plain(text: string): string {
  const comment = text.search(/[ \t]#/)
  return (comment === -1 ? text : text.slice(0, comment)).trim()
}

function doubleQuoted(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'string' ? value : undefined
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function closingOf(text: string, quote: '"' | "'"): number | undefined {
  for (let at = 1; at < text.length; at += 1) {
    const char = text[at]
    if (quote === '"' && char === '\\') at += 1
    else if (char === quote) {
      if (quote === "'" && text[at + 1] === "'") at += 1
      else return at + 1
    }
  }
  return undefined
}

function quoted(text: string, quote: '"' | "'"): string | undefined {
  const end = closingOf(text, quote)
  if (end === undefined) return undefined
  const rest = text.slice(end)
  if (rest !== '' && !/^[ \t]+#/.test(rest)) return undefined
  const inner = text.slice(0, end)
  return quote === '"' ? doubleQuoted(inner) : inner.slice(1, -1).replaceAll("''", "'")
}

function scalarOf(first: string, more: readonly string[]): string | undefined {
  const text = first.trim()
  if (text.startsWith('|') || text.startsWith('>')) return undefined
  if (text.startsWith('"') || text.startsWith("'"))
    return more.length === 0 ? quoted(text, text.startsWith('"') ? '"' : "'") : undefined
  const value = [first, ...more]
    .map(plain)
    .filter(part => part !== '')
    .join(' ')
  return value === '' ? undefined : value
}

export function readByLine(yaml: string): LineFields {
  const lines = yaml.split(/\r?\n/)
  const found = new Map<string, (string | undefined)[]>()
  lines.forEach((line, index) => {
    const key = KEY_LINE.exec(line)
    if (key === null) return
    const more: string[] = []
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next] ?? ''
      if (!CONTINUATION.test(candidate)) break
      more.push(candidate)
    }
    const field = key[1] ?? ''
    found.set(field, [...(found.get(field) ?? []), scalarOf(key[2] ?? '', more)])
  })
  const one = (field: string): string | undefined => {
    const values = found.get(field)
    return values?.length === 1 ? values[0] : undefined
  }
  const name = one('name')
  const description = one('description')
  return {
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
  }
}
