// The web host's configuration: command-line flags first, then environment variables, then defaults.

export type WebHostConfig = Readonly<{ server: string; port: number }>

export const DEFAULT_SERVER = 'http://127.0.0.1:8787'
export const DEFAULT_PORT = 8790

export const USAGE = `usage: omne-desktop-host [--server <origin>] [--port <port>]

  --server <origin>  the server entry (env OMNE_SERVER, default ${DEFAULT_SERVER})
  --port <port>      the loopback port this host listens on (env OMNE_DESKTOP_PORT, default ${DEFAULT_PORT})`

export type ConfigResult = { readonly config: WebHostConfig } | { readonly usage: string }

function flag(args: readonly string[], name: string): string | undefined | null {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  return args[index + 1] ?? null
}

export function readConfig(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ConfigResult {
  if (args.includes('--help')) return { usage: USAGE }
  const known = new Set(['--server', '--port'])
  for (let i = 0; i < args.length; i += 2)
    if (!known.has(args[i]!)) return { usage: `unknown argument: ${args[i]}\n${USAGE}` }
  const server = flag(args, '--server')
  const port = flag(args, '--port')
  if (server === null || port === null) return { usage: USAGE }
  const portText = port ?? env['OMNE_DESKTOP_PORT'] ?? String(DEFAULT_PORT)
  const portNumber = Number(portText)
  if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535)
    return { usage: `bad port: ${portText}\n${USAGE}` }
  return { config: { server: server ?? env['OMNE_SERVER'] ?? DEFAULT_SERVER, port: portNumber } }
}
