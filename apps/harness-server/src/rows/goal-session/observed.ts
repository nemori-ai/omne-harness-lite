import type { DescribeCall } from '@omne-harness/goal-session'

/** The Files commands that change what is on disk. */
const FILE_WRITES: ReadonlySet<string> = new Set(['write', 'edit', 'patch', 'delete', 'mkdir'])
const EXIT = /^completed exit=(\{[^\n]*\}) duration_ms=/mu

type Fields = Readonly<Record<string, unknown>>
const fieldsOf = (value: unknown): Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {}
const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The exit code a one-shot Shell run reports in its result; null when it reports none. */
export function exitOf(result: string): number | null {
  const found = EXIT.exec(result)
  if (found === null) return null
  try {
    const exit = fieldsOf(JSON.parse(found[1] ?? ''))
    return exit['kind'] === 'code' && typeof exit['code'] === 'number' ? exit['code'] : null
  } catch {
    return null
  }
}

/** What a tool call of this release was, in the terms a judging of goals reads: the tools here are the release's own. */
export const describeCall: DescribeCall = ({ tool, arguments: given, result }) => {
  const args = fieldsOf(given)
  const command = textOf(args['command'])
  const params = 'params' in args ? fieldsOf(args['params']) : args
  const name = command === null ? tool : `${tool} ${command}`
  const path = textOf(params['path'])
  if (tool === 'Shell') {
    const script = command === 'execute' ? textOf(params['script']) : null
    return { tool: name, command: script, path: null, exit: exitOf(result), writes: false }
  }
  const wrote = tool === 'Files' && FILE_WRITES.has(command ?? '') && result.startsWith('done')
  return { tool: name, command: null, path, exit: null, writes: wrote }
}
