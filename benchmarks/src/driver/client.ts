import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { ran, until, type Ran } from './process.ts'

export type Client = Readonly<{
  omne: (args: readonly string[], credential?: string) => Promise<Ran>
  session: (definition?: string) => Promise<string>
  send: (session: string, text: string) => Promise<void>
  history: (session: string) => Promise<string>
  runsEnded: (session: string, count: number, limitMs: number) => Promise<string>
}>

const TERMINAL = /run\.terminal: /gu

export function clientOf(
  input: Readonly<{ root: string; directory: string; server: string }>,
): Client {
  const bin = join(input.root, 'apps', 'cli', 'dist', 'bin.js')
  const env: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'] ?? '',
    HOME: input.directory,
    USERPROFILE: input.directory,
    OMNE_HOME: join(input.directory, 'omne'),
    OMNE_SERVER: input.server,
    NO_COLOR: '1',
  }
  const omne: Client['omne'] = (args, credential) =>
    ran(process.execPath, [bin, ...args], {
      cwd: input.directory,
      env,
      ...(credential === undefined ? {} : { input: `${credential}\n` }),
    })
  const done = async (args: readonly string[], credential?: string): Promise<Ran> => {
    const result = await omne(args, credential)
    if (result.status !== 0)
      throw new Error(
        `omne ${args[0] ?? ''} ended with ${String(result.status)}: ${result.stderr.trim()}`,
      )
    return result
  }
  const history: Client['history'] = async session =>
    (await done(['read-history', '--session', session])).stdout
  return {
    omne,
    session: async (definition = 'coding') => {
      const credential = `pw-${randomBytes(8).toString('hex')}`
      const identifier = `bench-${randomBytes(4).toString('hex')}`
      await done(['register', '--login-identifier', identifier], credential)
      await done(['login', '--login-identifier', identifier], credential)
      const created = await done(['create-session', '--definition', definition])
      const body = (JSON.parse(created.stdout) as { body?: { session?: string } }).body
      if (body?.session === undefined) throw new Error(`no session was created: ${created.stdout}`)
      return body.session
    },
    send: async (session, text) => {
      await done(['send-input', '--session', session, '--text', text])
    },
    history,
    runsEnded: (session, count, limitMs) =>
      until(
        async () => {
          const text = await history(session)
          return (text.match(TERMINAL)?.length ?? 0) >= count ? text : undefined
        },
        `${String(count)} runs of the session to end`,
        limitMs,
      ),
  }
}
