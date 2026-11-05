// The matching rule of `search`, by the contract SPEC "目录的匹配规则": a pure function over the
// query, the name and the description. Each text is NFKC-normalized and lower-cased; the query
// splits into words on white space; the identity matches when every word is a substring of the
// name and the description joined by one newline. A query without words matches everything.
function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

export function matches(query: string, name: string, description: string | undefined): boolean {
  // Splitting on each white space character leaves empty words between, before and after the
  // spaces. An empty word is a substring of every text, so it matches like no word at all, and a
  // query of only white space matches everything.
  const words = fold(query).split(/\s/u)
  const text = fold(description === undefined ? name : `${name}\n${description}`)
  return words.every(word => text.includes(word))
}
