const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"

/** An override encloses the entire source and its jobs; base state stays in the PTY shell. */
export function terminalScript(input: {
  id: string
  directory: string
  cwd?: string
  env?: Readonly<Record<string, string>>
  stdin?: string
}): string {
  const base = `${input.directory}/${input.id}`
  const source =
    `builtin source ${quote(base + '.script')}` +
    (input.stdin === undefined ? '' : ` <${quote(base + '.input')}`)
  if (input.cwd === undefined && input.env === undefined) return source + '\n'
  const commands: string[] = []
  if (input.cwd !== undefined) commands.push(`builtin cd -- ${quote(input.cwd)} || builtin exit`)
  for (const [key, value] of Object.entries(input.env ?? {}))
    commands.push(`builtin export ${quote(`${key}=${value}`)}`)
  commands.push(
    source,
    '__omne_override_code=$?',
    'builtin wait',
    'builtin exit "$__omne_override_code"',
  )
  return `( ${commands.join('; ')} )\n`
}
