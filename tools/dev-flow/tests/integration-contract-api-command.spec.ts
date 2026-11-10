// How `contractApiCommand` turns the manifest of the installed repo-toolchain into the command that
// starts `omne-contract-api`, and what it says when it cannot. The manifest lookup is a stand-in
// that points at manifests written here; the real CLI runs in integration-contract-check.spec.ts.
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { contractApiCommand } from '../src/integration/contract-api.ts'

const lookup = vi.hoisted(() => ({ find: vi.fn<(specifier: string) => string | undefined>() }))
vi.mock('node:module', () => ({ findPackageJSON: lookup.find }))

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'dev-flow-contract-api-command-')))
afterAll(() => rmSync(directory, { recursive: true, force: true }))
beforeEach(() => lookup.find.mockReset())

/** Writes `text` as the manifest the lookup finds, and returns its path. */
function manifest(text: string): string {
  const path = join(directory, 'package.json')
  writeFileSync(path, text)
  lookup.find.mockReturnValue(path)
  return path
}
const unavailable = (reason: unknown) => ({ kind: 'unavailable', reason })

describe('contractApiCommand', () => {
  it('starts the bin script that the manifest names with the running node, relative to the manifest', () => {
    const path = manifest(JSON.stringify({ bin: { 'omne-contract-api': './dist/api-cli.js' } }))
    expect(contractApiCommand()).toEqual({
      file: process.execPath,
      args: [join(dirname(path), './dist/api-cli.js')],
    })
    expect(lookup.find).toHaveBeenCalledWith('@omne-harness/repo-toolchain', expect.any(String))
  })

  it('says which package it could not resolve when the lookup finds none', () => {
    lookup.find.mockReturnValue(undefined)
    const result = contractApiCommand()
    expect(result).toMatchObject({ kind: 'unavailable' })
    const { reason } = result as { reason: string }
    expect(reason).toContain('omne-contract-api')
    expect(reason).toContain('@omne-harness/repo-toolchain')
  })

  it.each([
    ['a manifest that is not JSON', 'not json', 'package.json'],
    ['a manifest without bin', '{}', 'bin'],
    ['a manifest whose bin lacks the CLI', '{"bin":{"other":"./x.js"}}', 'bin.omne-contract-api'],
    ['a bin entry that is no string', '{"bin":{"omne-contract-api":7}}', 'bin.omne-contract-api'],
  ])('is unavailable, with the reason, for %s', (_, text, mentioned) => {
    manifest(text)
    const result = contractApiCommand()
    expect(result).toMatchObject(unavailable(expect.stringContaining('找不到 omne-contract-api：')))
    expect((result as { reason: string }).reason).toContain(mentioned)
  })
})
