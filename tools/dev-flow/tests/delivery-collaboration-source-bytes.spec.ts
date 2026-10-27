import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exactTextBlob, git } from '../src/integration/git.ts'
import { digest } from '../src/integration/parse.ts'
import {
  ACCEPTANCE_SOURCES_PATH,
  readAcceptanceSources,
  readAcceptanceSourcesRest,
} from '../src/delivery/collaboration-acceptance-source.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function committed(text: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'source-bytes-')))
  roots.push(root)
  git(root, ['init', '-q'])
  mkdirSync(join(root, 'docs/engineering'), { recursive: true })
  writeFileSync(join(root, ACCEPTANCE_SOURCES_PATH), text)
  git(root, ['add', '.'])
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'Source bytes',
  ])
  const commit = git(root, ['rev-parse', 'HEAD'])
  const source = {
    commit,
    path: ACCEPTANCE_SOURCES_PATH,
    blob: git(root, ['rev-parse', `${commit}:${ACCEPTANCE_SOURCES_PATH}`]),
    digest: digest(text),
  }
  const read = () => ({
    type: 'file',
    path: source.path,
    sha: source.blob,
    encoding: 'base64',
    content: Buffer.from(text).toString('base64'),
  })
  return { root, source, read }
}

describe('acceptance source byte identity across transports', () => {
  it('preserves the UTF-8 byte order marker instead of changing a digest input', () => {
    const text = '\ufeff{"schemaVersion":1,"entries":[]}\n'
    const f = committed(text)
    expect(exactTextBlob(f.root, f.source.commit, f.source.path).text).toBe(text)
  })

  it('refuses invalid UTF-8 instead of hashing replacement characters', () => {
    const f = committed('{"schemaVersion":1,"entries":[]}')
    writeFileSync(join(f.root, ACCEPTANCE_SOURCES_PATH), Buffer.from([0xff, 0x0a]))
    git(f.root, ['add', '.'])
    git(f.root, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'Invalid source encoding',
    ])
    const commit = git(f.root, ['rev-parse', 'HEAD'])
    expect(() => exactTextBlob(f.root, commit, ACCEPTANCE_SOURCES_PATH)).toThrow()
  })

  it.each(['', '\n', '\r\n', '\n\n', ' \t\n'])(
    'accepts the same raw digest with ending %j',
    ending => {
      const text = '{"schemaVersion":2,"entries":[],"mandates":[]}' + ending
      const f = committed(text)
      const local = readAcceptanceSources(f.root, f.source)
      const remote = readAcceptanceSourcesRest('owner/repo', f.source, f.read)
      expect(local).toEqual(remote)
      expect(local.source.digest).toBe(digest(text))
    },
  )

  it('refuses a whitespace-normalized digest in both transports', () => {
    const text = '{"schemaVersion":1,"entries":[]}\r\n'
    const f = committed(text)
    const normalized = { ...f.source, digest: digest('{"schemaVersion":1,"entries":[]}') }
    expect(() => readAcceptanceSources(f.root, normalized)).toThrow('source-changed')
    expect(() => readAcceptanceSourcesRest('owner/repo', normalized, f.read)).toThrow(
      'source-changed',
    )
  })
})
