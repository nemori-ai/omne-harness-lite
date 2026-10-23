/** Line-level readers of the Issue body text shared by the delivery observations. */

/** `- 名称：值` list fields of the text, every value in order of appearance. */
export function bodyFields(body: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s*-\s+([^：:]+)[：:]\s*(.*?)\s*$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined)
      result.set(match[1], [...(result.get(match[1]) ?? []), match[2]])
  }
  return result
}

/** The text of each `## 标题` section, every occurrence in order. */
export function bodySections(body: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const parts = body.split(/^\s*## ([^\r\n]+)\s*$/m)
  for (let index = 1; index < parts.length; index += 2) {
    const name = parts[index]?.trim(),
      content = parts[index + 1]?.trim()
    if (name !== undefined && content !== undefined)
      result.set(name, [...(result.get(name) ?? []), content])
  }
  return result
}
