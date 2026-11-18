/** Words apart from options; an option named in `valued` takes the argument after it as its value. */
export function splitArguments(
  args: readonly string[],
  valued: readonly string[],
): { words: string[]; options: string[] } {
  const words: string[] = []
  const options: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''
    if (valued.includes(arg)) {
      options.push(arg)
      const value = args[index + 1]
      if (value !== undefined) options.push(value)
      index += 1
    } else if (arg.startsWith('-')) options.push(arg)
    else words.push(arg)
  }
  return { words, options }
}
