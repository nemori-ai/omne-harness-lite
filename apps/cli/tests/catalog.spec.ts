import {
  defineCatalog,
  parseArgv,
  productionCatalog,
  renderHelp,
  run,
  type Catalog,
  type CommandEnvironment,
  type CommandServices,
} from '@omne-harness/cli'
import { describe, expect, it } from 'vitest'
import { expectedEmptyHelp, expectedHelp } from './support/expected.ts'

const status: Catalog = defineCatalog({
  ...productionCatalog,
  commands: [
    {
      name: 'status',
      usage: '[--json]',
      summary: 'Print the current status.',
      run: async (_args, output, environment) => {
        output.stdout(`${environment.homeFlag ?? ''}\n`)
        return 0
      },
    },
    {
      name: 'version-name',
      usage: '',
      summary: 'Shorter.',
      run: async () => 0,
    },
  ],
})

const services: CommandServices = {
  createTransport: () => {
    throw new Error('not used')
  },
  readCredential: async () => ({ kind: 'failure', message: 'not used' }),
  newId: () => 'id',
}

const runtime = {
  catalog: status,
  readIdentity: () => ({ kind: 'identity' as const, version: '9' }),
  environmentHome: '/env-home',
  homeDirectory: '/user',
  environmentServer: 'http://127.0.0.1:1',
  services,
}

describe('command catalog', () => {
  it('renders the help text of the spec from the production catalog', () => {
    expect(renderHelp(productionCatalog)).toBe(expectedHelp)
  })

  it('renders the help text of the spec for an empty command list', () => {
    const homeOptions = productionCatalog.options.filter(
      option => option.usage.includes('HOME') || option.usage.startsWith('--home'),
    )
    const empty = defineCatalog({ ...productionCatalog, commands: [], options: homeOptions })
    expect(renderHelp(empty)).toBe(expectedEmptyHelp)
  })

  it('registers exactly the six commands of the spec', () => {
    expect(productionCatalog.commands.map(command => command.name)).toEqual([
      'register',
      'login',
      'create-session',
      'send-input',
      'cancel-run',
      'stop-call',
    ])
  })

  it('aligns command summaries and dispatches a command with its home flag', async () => {
    const help = renderHelp(status)
    expect(help).toContain('  omne status [--json]    Print the current status.')
    expect(help).toContain('  omne version-name       Shorter.')
    expect(help).toContain('Show help or version, or run a command.')
    const parsed = parseArgv(['--home', '/state', 'status', '--json'], status)
    expect(parsed).toMatchObject({ kind: 'command', args: ['--json'], homeFlag: '/state' })
    let stdout = ''
    const code = await run(
      ['status', '--home', '/state', '--json'],
      {
        stdout: text => {
          stdout += text
        },
        stderr: () => {},
      },
      runtime,
    )
    expect(code).toBe(0)
    expect(stdout).toBe('/state\n')
  })

  it('passes the process environment without reading it inside the command', async () => {
    let seen: CommandEnvironment | undefined
    const catalog = defineCatalog({
      ...productionCatalog,
      commands: [
        {
          name: 'status',
          usage: '',
          summary: 'Show status.',
          run: async (_args, _output, environment) => {
            seen = environment
            return 0
          },
        },
      ],
    })
    await run(['status'], { stdout: () => {}, stderr: () => {} }, { ...runtime, catalog })
    expect(seen).toEqual({
      homeFlag: undefined,
      environmentHome: '/env-home',
      homeDirectory: '/user',
      environmentServer: 'http://127.0.0.1:1',
      services,
    })
  })

  it('uses the injected identity reader for version', async () => {
    let stdout = ''
    const code = await run(
      ['--version'],
      {
        stdout: text => {
          stdout += text
        },
        stderr: () => {},
      },
      runtime,
    )
    expect(code).toBe(0)
    expect(stdout).toBe('9\n')
  })

  it('rejects a catalog command that cannot be dispatched', () => {
    expect(() =>
      defineCatalog({
        ...productionCatalog,
        commands: [{ name: '--hidden', usage: '', summary: 'No.', run: async () => 0 }],
      }),
    ).toThrow(TypeError)
    expect(() =>
      defineCatalog({
        ...productionCatalog,
        commands: [
          { name: 'status', usage: '', summary: 'One.', run: async () => 0 },
          { name: 'status', usage: '', summary: 'Two.', run: async () => 0 },
        ],
      }),
    ).toThrow(TypeError)
  })

  it('keeps the production parser from accepting an unregistered name', () => {
    expect(parseArgv(['status'])).toMatchObject({ kind: 'usage-error' })
  })

  it('lets the production parser accept the registered names with and without --home', () => {
    expect(parseArgv(['cancel-run', '--run', 'r'])).toMatchObject({
      kind: 'command',
      args: ['--run', 'r'],
      homeFlag: undefined,
    })
    expect(parseArgv(['--home', '/state', 'login'])).toMatchObject({
      kind: 'command',
      homeFlag: '/state',
    })
  })
})
