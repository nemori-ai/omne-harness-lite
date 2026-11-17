export function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&')
    .replaceAll('**/', '\u0001')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0001', '(?:.*/)?')
    .replaceAll('\u0000', '.*')
  return new RegExp(`^${escaped}$`, 'u')
}
