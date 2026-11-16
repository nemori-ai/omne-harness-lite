function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

export function matches(query: string, name: string, description: string | undefined): boolean {
  const words = fold(query).split(/\s/u)
  const text = fold(description === undefined ? name : `${name}\n${description}`)
  return words.every(word => text.includes(word))
}
