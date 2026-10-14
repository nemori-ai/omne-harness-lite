import { parseArgv, productionCatalog, renderHelp, run, type Catalog } from '@omne-harness/cli'
import { describe, expect, it } from 'vitest'
import { expectedHelp } from './support/expected.ts'

const status: Catalog = {
  ...productionCatalog,
  commands: [
    {
      name: 'status',
      usage: '[--json]',
      summary: 'Print the current status.',
      run: (_args, output) => {
        output.stdout('ok\n')
        return 0
      },
    },
  ],
}

describe('command catalog', () => {
  it('renders the pinned help text from the production catalog', () => {
    expect(renderHelp(productionCatalog)).toBe(expectedHelp)
  })

  it('includes a registered command in help and dispatches it', () => {
    const help = renderHelp(status)
    expect(help).toContain('  omne status [--json]    Print the current status.')
    expect(help).toContain('Show help or version, or run a command.')
    expect(help).not.toBe(expectedHelp)
    expect(parseArgv(['status', '--json'], status)).toMatchObject({
      kind: 'command',
      args: ['--json'],
    })
    let stdout = ''
    const code = run(
      ['status', '--json'],
      {
        stdout: text => {
          stdout += text
        },
        stderr: () => {},
      },
      status,
    )
    expect(code).toBe(0)
    expect(stdout).toBe('ok\n')
  })

  it('keeps the production parser from accepting an unregistered name', () => {
    expect(parseArgv(['status'])).toMatchObject({ kind: 'usage-error' })
  })
})
