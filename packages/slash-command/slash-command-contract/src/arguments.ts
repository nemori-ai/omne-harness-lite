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
