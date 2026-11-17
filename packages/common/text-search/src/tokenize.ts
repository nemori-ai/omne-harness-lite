export function tokenize(text: string): readonly string[] {
  const tokens: string[] = []
  for (const match of text
    .normalize('NFKC')
    .matchAll(/\p{Script=Han}+|(?:(?!\p{Script=Han})[\p{L}\p{N}_])+/gu)) {
    const word = match[0]
    if (/^\p{Script=Han}/u.test(word)) {
      const characters = [...word]
      tokens.push(...characters)
      let previous: string | undefined
      for (const character of characters) {
        if (previous !== undefined) tokens.push(previous + character)
        previous = character
      }
    } else {
      const full = word.toLowerCase()
      const parts = word
        .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/gu, '$1 $2')
        .split(/[_\s]+/u)
        .filter(Boolean)
        .map(part => part.toLowerCase())
      tokens.push(...parts)
      if (!parts.includes(full)) tokens.push(full)
    }
  }
  return tokens
}
