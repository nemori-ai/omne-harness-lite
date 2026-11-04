// The line by line reading of a frontmatter that strict YAML does not read. Community Skills
// often carry such frontmatters (for example an unquoted ": " inside the description), and the
// main hosts read them. Only the two top-level fields that a Skill needs are read: `name` and
// `description`. A field is read when its key starts a line, appears once, and its value is a
// plain scalar (with indented continuation lines), or a single-line quoted scalar. A block
// scalar (`|`, `>`) or anything else is not read: the field is then absent.

/** The two fields, each present only when it could be read. */
export type LineFields = Readonly<{ name?: string; description?: string }>

const KEY_LINE = /^(name|description):(?:[ \t]+(.*))?$/
const CONTINUATION = /^[ \t]+\S/

/** The value of a plain scalar: the text before a ` #` comment, trimmed. */
function plain(text: string): string {
  const comment = text.search(/[ \t]#/)
  return (comment === -1 ? text : text.slice(0, comment)).trim()
}

/** The value of a double-quoted scalar, read like a JSON string. */
function doubleQuoted(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'string' ? value : undefined
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/** Where the quoted scalar that opens `text` closes: the index after its closing quote. A
 * backslash escapes in double quotes; a doubled quote escapes in single quotes. */
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

/** A single-line quoted scalar, which a comment may follow; `undefined` when not readable. */
function quoted(text: string, quote: '"' | "'"): string | undefined {
  const end = closingOf(text, quote)
  if (end === undefined) return undefined
  const rest = text.slice(end)
  if (rest.trim() !== '' && !/^[ \t]+#/.test(rest)) return undefined
  const inner = text.slice(0, end)
  return quote === '"' ? doubleQuoted(inner) : inner.slice(1, -1).replaceAll("''", "'")
}

/** One scalar from its first line and its continuation lines; `undefined` when not readable. */
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

/** `name` and `description` of the YAML text `yaml`, read line by line. */
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
  /** The one value of `field`, or `undefined` when it is absent, repeated or not readable. */
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
