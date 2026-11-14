import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { failureLine, isEntryPoint, runMain } from '../src/integration/cli.ts'
import { IntegrationError } from '../src/integration/parse.ts'

afterEach(() => vi.restoreAllMocks())

const CLI_URL = new URL('../src/integration/cli.ts', import.meta.url).href

function run(argv: string[]) {
  const failures: string[] = []
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const code = runMain(argv, line => failures.push(line))
  return { code, failures, stdout: stdout.mock.calls.map(call => String(call[0])).join('') }
}

describe('isEntryPoint', () => {
  it('is true when the started script is this module, also by a relative path', () => {
    const path = fileURLToPath(CLI_URL)
    expect(isEntryPoint(path, CLI_URL)).toBe(true)
    expect(isEntryPoint(path.replace(process.cwd(), '.'), CLI_URL)).toBe(true)
  })

  it('is false for another script or none', () => {
    expect(isEntryPoint('/somewhere/else.ts', CLI_URL)).toBe(false)
    expect(isEntryPoint(undefined, CLI_URL)).toBe(false)
  })
})

describe('importing the CLI module', () => {
  it('runs nothing when another script started the process', async () => {
    const argv = process.argv
    const exitCode = process.exitCode
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.resetModules()
    process.argv = [argv[0] ?? 'node', '/somewhere/else.ts', '--help']
    try {
      await import('../src/integration/cli.ts')
    } finally {
      process.argv = argv
      process.exitCode = exitCode
    }
    expect(stdout).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(exitCode)
  })
})

describe('failureLine', () => {
  it('writes one JSON line with the code of an IntegrationError', () => {
    expect(failureLine(new IntegrationError('refused', 'no'))).toBe(
      '{"code":"refused","message":"no"}\n',
    )
  })

  it('uses the code unknown for any other error, and the text of a value that is no error', () => {
    expect(failureLine(new Error('boom'))).toBe('{"code":"unknown","message":"boom"}\n')
    expect(failureLine('plain')).toBe('{"code":"unknown","message":"plain"}\n')
  })
})

describe('runMain', () => {
  it('prints the usage and exits 0 for no command, --help and contract-check --help', () => {
    for (const argv of [[], ['--help'], ['contract-check', '--help']]) {
      const { code, failures, stdout } = run(argv)
      expect(code).toBe(0)
      expect(failures).toEqual([])
      expect(stdout).toMatch(/^integration contract-check \[--root PATH\]/)
    }
  })

  it('exits 2 with an input-error line for an unknown command', () => {
    const { code, failures, stdout } = run(['bogus'])
    expect(code).toBe(2)
    expect(failures).toEqual(['{"code":"input-error","message":"Unknown command"}\n'])
    expect(stdout).toBe('')
  })

  it('exits 2 with an input-error line for an unknown or repeated option', () => {
    for (const argv of [
      ['contract-check', '--bogus', 'x'],
      ['contract-check', '--root'],
      ['contract-check', '--root', 'a', '--root', 'b'],
    ]) {
      const { code, failures } = run(argv)
      expect(code).toBe(2)
      expect(failures).toEqual(['{"code":"input-error","message":"Invalid or repeated option"}\n'])
    }
  })
})
