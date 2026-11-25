/** One argument as written: where it starts and ends in the text, and its value without the quotes around it. */
export type Argument = Readonly<{ from: number; to: number; value: string }>

const PART = /"[^"]*"|\S+/gu

/** Splits what follows a command at white space; a run in double quotes is one argument. */
export function splitArguments(args: string): readonly Argument[] {
  return [...args.matchAll(PART)].map(found => {
    const text = found[0]
    return { from: found.index, to: found.index + text.length, value: text.replace(/^"|"$/gu, '') }
  })
}

/** Where the caret stands among the arguments of the command at the head: which one, its span, and what is typed of it. */
export type ArgumentPlace = Readonly<{
  command: string
  index: number
  from: number
  to: number
  query: string
}>

const HEAD = /^\s*\/([a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)*)(?=\s|$)/iu

/** The argument the caret is on, split as the prompt expands it; null when the caret is not past a command at the head. */
export function argumentAt(text: string, caret: number): ArgumentPlace | null {
  const head = HEAD.exec(text)
  if (head === null || caret <= head[0].length) return null
  const command = (head[1] ?? '').toLowerCase()
  const start = head[0].length
  const before = text.slice(start, caret)
  const quotes = [...before.matchAll(/"/gu)].map(found => found.index)
  if (quotes.length % 2 === 1) {
    const open = quotes.at(-1) ?? 0
    const index = splitArguments(before.slice(0, open)).length
    return { command, index, from: start + open, to: caret, query: before.slice(open + 1) }
  }
  const typed = splitArguments(before)
  if (/\s$/u.test(before))
    return { command, index: typed.length, from: caret, to: caret, query: '' }
  const last = typed.at(-1) as Argument
  const whole = splitArguments(text.slice(start)).find(word => word.from === last.from)
  const query = before.slice(last.from).replace(/^"/u, '')
  return {
    command,
    index: typed.length - 1,
    from: start + last.from,
    to: start + (whole?.to ?? last.to),
    query,
  }
}
