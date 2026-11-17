const WORDS = /(?<han>\p{Script=Han}+)|(?:(?!\p{Script=Han})[\p{L}\p{N}_])+/gu

function hanTokens(run: string): readonly string[] {
  const characters = [...run]
  return [
    ...characters,
    ...characters.slice(1).map((character, index) => characters[index] + character),
  ]
}

function wordTokens(word: string): readonly string[] {
  const full = word.toLowerCase()
  const parts = word
    .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/gu, '$1 $2')
    .split(/[_ ]/u)
    .filter(Boolean)
    .map(part => part.toLowerCase())
  return parts.includes(full) ? parts : [...parts, full]
}

export function tokenize(text: string): readonly string[] {
  return [...text.normalize('NFKC').matchAll(WORDS)].flatMap(match =>
    match.groups?.han === undefined ? wordTokens(match[0]) : hanTokens(match.groups.han),
  )
}
