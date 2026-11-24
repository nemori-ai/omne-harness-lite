const EXTERNAL = new Set(['http:', 'https:', 'mailto:'])

export function externalTarget(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  return EXTERNAL.has(parsed.protocol) ? parsed.toString() : undefined
}
