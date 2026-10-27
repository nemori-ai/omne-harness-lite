import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
const tool = 'a'.repeat(40)
const head = 'b'.repeat(40)
const installation = {
  repository: 'owner/repo',
  toolCommit: tool,
  facts: { kind: 'published', workflow: { head } },
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const descriptor = JSON.stringify(installation, null, 2) + '\n'

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function snapshot(text: string | undefined, expectedDigest: string | undefined) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'workflow-installation-')))
  directories.push(directory)
  const workflow = readFileSync(resolve('../../.github/workflows/integration-request.yml'), 'utf8')
  const script = workflow.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s+NODE\n/)?.[1]
  if (script === undefined)
    throw new Error('The deployed workflow has no installation snapshot step')
  const output = join(directory, 'output')
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    input: script,
    encoding: 'utf8',
    env: {
      ...process.env,
      INSTALLATION_DESCRIPTOR: text,
      INSTALLATION_SHA256: expectedDigest,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_SHA: head,
      RUNNER_TEMP: directory,
      GITHUB_OUTPUT: output,
    },
    timeout: 5_000,
  })
  return { result, output, descriptorPath: join(directory, 'omne-installation.json') }
}

describe('request workflow installation snapshot', () => {
  it('retains exact descriptor bytes and emits only the validated checkout identity', () => {
    const digest = sha256(descriptor)
    const { result, output, descriptorPath } = snapshot(descriptor, digest)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(descriptorPath, 'utf8')).toBe(descriptor)
    expect(readFileSync(output, 'utf8')).toBe(`tool-commit=${tool}\nsha256=${digest}\n`)
  })

  it.each([
    ['missing descriptor', undefined, undefined],
    ['wrong digest', descriptor, 'c'.repeat(64)],
    ['wrong repository', JSON.stringify({ ...installation, repository: 'other/repo' }), null],
    [
      'injected checkout identity',
      JSON.stringify({ ...installation, toolCommit: tool + '\nother=value' }),
      null,
    ],
    [
      'wrong workflow',
      JSON.stringify({ ...installation, facts: { kind: 'published', workflow: { head: tool } } }),
      null,
    ],
    ['direct mode', JSON.stringify({ ...installation, facts: { kind: 'direct' } }), null],
  ])(
    'rejects %s before publishing a checkout identity or snapshot',
    (_name, text, expectedDigest) => {
      const actualText = typeof text === 'string' ? text : undefined
      const digest =
        expectedDigest === null && actualText !== undefined
          ? sha256(actualText)
          : (expectedDigest ?? undefined)
      const { result, output, descriptorPath } = snapshot(actualText, digest)
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/Adopted installation bytes|Installation does not adopt/)
      expect(existsSync(output)).toBe(false)
      expect(existsSync(descriptorPath)).toBe(false)
    },
  )
})
