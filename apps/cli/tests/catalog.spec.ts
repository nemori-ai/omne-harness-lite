import {
  defineCatalog,
  parseArgv,
  productionCatalog,
  renderHelp,
  run,
  type Catalog,
  type CommandEnvironment,
} from '@omne-harness/cli'
import { describe, expect, it } from 'vitest'
import { expectedHelp } from './support/expected.ts'

const status: Catalog = defineCatalog({
  ...productionCatalog,
  commands: [
    {
      name: 'status',
      usage: '[--json]',
      summary: 'Print the current status.',
      run: (_args, output, environment) => {
        output.stdout(`${environment.homeFlag ?? ''}\n`)
        return 0
      },
    },
    {
      name: 'version-name',
      usage: '',
      summary: 'Shorter.',
      run: () => 0,
    },
  ],
})

const runtime = {
  catalog: status,
  readIdentity: () => ({ kind: 'identity' as const, version: '9' }),
  environmentHome: '/env-home',
  homeDirectory: '/user',
}

describe('command catalog', () => {
  it('renders the pinned help text from the production catalog', () => {
    expect(renderHelp(productionCatalog)).toBe(expectedHelp)
  })

  it('aligns command summaries and dispatches a command with its home flag', () => {
    const help = renderHelp(status)
    expect(help).toContain('  omne status [--json]    Print the current status.')
    expect(help).toContain('  omne version-name       Shorter.')
    expect(help).toContain('Show help or version, or run a command.')
    const parsed = parseArgv(['--home', '/state', 'status', '--json'], status)
    expect(parsed).toMatchObject({ kind: 'command', args: ['--json'], homeFlag: '/state' })
    let stdout = ''
    const code = run(
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

  it('passes the process environment without reading it inside the command', () => {
    let seen: CommandEnvironment | undefined
    const catalog = defineCatalog({
      ...productionCatalog,
      commands: [
        {
          name: 'status',
          usage: '',
          summary: 'Show status.',
          run: (_args, _output, environment) => {
            seen = environment
            return 0
          },
        },
      ],
    })
    run(['status'], { stdout: () => {}, stderr: () => {} }, { ...runtime, catalog })
    expect(seen).toEqual({
      homeFlag: undefined,
      environmentHome: '/env-home',
      homeDirectory: '/user',
    })
  })

  it('uses the injected identity reader for version', () => {
    let stdout = ''
    const code = run(
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
        commands: [{ name: '--hidden', usage: '', summary: 'No.', run: () => 0 }],
      }),
    ).toThrow(TypeError)
    expect(() =>
      defineCatalog({
        ...productionCatalog,
        commands: [
          { name: 'status', usage: '', summary: 'One.', run: () => 0 },
          { name: 'status', usage: '', summary: 'Two.', run: () => 0 },
        ],
      }),
    ).toThrow(TypeError)
  })

  it('keeps the production parser from accepting an unregistered name', () => {
    expect(parseArgv(['status'])).toMatchObject({ kind: 'usage-error' })
  })
})
