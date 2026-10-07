import { fileURLToPath } from 'node:url'

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
export function terminalScript(input: {
  id: string
  directory: string
  cwd?: string
  env?: Readonly<Record<string, string>>
}): string {
  const base = `${input.directory}/${input.id}`
  const sink =
    quote(process.execPath) +
    ' ' +
    quote(fileURLToPath(new URL('./terminal-sink.js', import.meta.url)))
  const source = `builtin source ${quote(base + '.script')} <${quote(base + '.input')}`
  const override = input.cwd !== undefined || input.env !== undefined
  const commands: string[] = []
  if (input.cwd !== undefined) commands.push(`builtin cd -- ${quote(input.cwd)} || builtin exit`)
  for (const [key, value] of Object.entries(input.env ?? {}))
    commands.push(`builtin export ${quote(`${key}=${value}`)}`)
  commands.push(source)
  const execute = override ? `( ${commands.join('; ')} )` : source
  return (
    `exec {__omne_out}> >(${sink} ${quote(base + '.out')}); __omne_out_pid=$!\n` +
    `exec {__omne_err}> >(${sink} ${quote(base + '.err')}); __omne_err_pid=$!\n` +
    `${execute} >&$__omne_out 2>&$__omne_err\n__omne_code=$?\n` +
    `exec {__omne_out}>&- {__omne_err}>&-\n` +
    `builtin printf '${input.id}\\0%s\\0%s\\0%s\\0%s\\0' "$__omne_code" "$PWD" "$__omne_out_pid" "$__omne_err_pid" >&3\n`
  )
}
