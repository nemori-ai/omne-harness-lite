// The address of the local server that `harness-server setup` configured on this host. The CLI
// reads only the `port` of the server settings file. The place of that file and its shape belong
// to harness-server (apps/harness-server/SPEC.md, local single-user profile). This module repeats
// the place rule, because an application does not import another application.
import { readFileSync } from 'node:fs'
import { posix, win32 } from 'node:path'

export type LocalServerInput = Readonly<{
  platform: NodeJS.Platform
  env: Readonly<Record<string, string | undefined>>
  home: string | undefined
  readFile?: (path: string) => string
}>

export type LocalServerRead =
  /** No settings file: the host has no local setup. */
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'address'; origin: string }>
  /** A settings file or a place variable is there but cannot be used. */
  | Readonly<{ kind: 'invalid'; message: string }>

function absolute(path: typeof posix, value: string | undefined): string | undefined {
  const text = value?.trim()
  return text !== undefined && text !== '' && path.isAbsolute(text) ? text : undefined
}

/** `<config>/server.json` by the harness-server place rule, or a message why it has no place. */
function settingsFile(input: LocalServerInput): string | Readonly<{ message: string }> | undefined {
  const path = input.platform === 'win32' ? win32 : posix
  const override = input.env['OMNE_SERVER_HOME']
  if (override !== undefined) {
    const home = absolute(path, override)
    if (home === undefined) return { message: 'omne: OMNE_SERVER_HOME is not an absolute path\n' }
    return path.join(home, 'config', 'server.json')
  }
  if (input.platform === 'win32') {
    const base =
      absolute(path, input.env['LOCALAPPDATA']) ??
      (input.home === undefined ? undefined : path.join(input.home, 'AppData', 'Local'))
    return base === undefined ? undefined : path.join(base, 'omne', 'config', 'server.json')
  }
  const base =
    absolute(path, input.env['XDG_CONFIG_HOME']) ??
    (input.home === undefined ? undefined : path.join(input.home, '.config'))
  return base === undefined ? undefined : path.join(base, 'omne', 'server.json')
}

function portOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('port' in value)) return undefined
  const port = value.port
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : undefined
}

export function readLocalServer(input: LocalServerInput): LocalServerRead {
  const file = settingsFile(input)
  if (file === undefined) return { kind: 'none' }
  if (typeof file !== 'string') return { kind: 'invalid', message: file.message }
  let text: string
  try {
    text = (input.readFile ?? (path => readFileSync(path, 'utf8')))(file)
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    if (code === 'ENOENT') return { kind: 'none' }
    return { kind: 'invalid', message: `omne: cannot read the local server settings ${file}\n` }
  }
  let port: number | undefined
  try {
    port = portOf(JSON.parse(text))
  } catch {
    port = undefined
  }
  if (port === undefined)
    return { kind: 'invalid', message: `omne: the local server settings ${file} give no port\n` }
  return { kind: 'address', origin: `http://127.0.0.1:${String(port)}` }
}
