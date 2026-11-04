// Relative Files paths resolve against the configured workspace root (R2-D290). The double below
// answers like the host files facility behind the release guard: a relative path is `invalidInput`,
// an absolute path outside the files root is `notAuthorized`. Each case names the defect it catches.
import type { FacilityResult } from '@omne-harness/execution-environment-contract'
import { expect, it } from 'vitest'
import { createFilesAuthor, type FilesAuthorEnvironment } from '@omne-harness/tool-definitions'
import { filesFixture } from './fixtures/files.ts'
import { run, value } from './run-author.ts'

type Path = { readonly path: string }

function construction(cwd?: string) {
  return {
    kind: 'object',
    entries: [
      { key: 'resultMaxBytes', value: { kind: 'number', lexeme: '32768' } },
      ...(cwd === undefined ? [] : [{ key: 'cwd', value: { kind: 'string', value: cwd } }]),
    ],
  } as const
}

/** A host-like facility over `root`: only absolute paths, only inside the root. */
function hostLike(root: string, initial: Record<string, string>, separator = '/') {
  const fixture = filesFixture(initial)
  const seen: string[] = []
  const absolute = (path: string) =>
    separator === '/' ? path.startsWith('/') : /^[A-Za-z]:\\/u.test(path)
  const inside = (path: string) => path === root || path.startsWith(root + separator)
  const gate = <T>(
    path: string,
    answer: () => Promise<FacilityResult<T>>,
  ): Promise<FacilityResult<T>> => {
    seen.push(path)
    if (!absolute(path))
      return Promise.resolve({ kind: 'rejected', requestId: 'host', reason: 'invalidInput' })
    if (!inside(path))
      return Promise.resolve({ kind: 'rejected', requestId: 'host', reason: 'notAuthorized' })
    return answer()
  }
  const files = fixture.environment.files
  const environment: FilesAuthorEnvironment = {
    files: {
      ...files,
      read: request => gate(request.path, () => files.read(request)),
      stat: request => gate(request.path, () => files.stat(request)),
      write: request => gate(request.path, () => files.write(request)),
      list: request =>
        gate(request.path, async () => {
          const listed = await files.list(request)
          if (listed.kind !== 'done') return listed
          const prefix = request.path + separator
          const entries = listed.value.entries
            .map(entry => ({ ...entry, name: `${separator}${entry.name}` }))
            .filter(entry => entry.name.startsWith(prefix))
            .map(entry => ({ ...entry, name: entry.name.slice(prefix.length) }))
          return { ...listed, value: { ...listed.value, entries } }
        }),
      move: request => {
        seen.push(request.target.path)
        return gate(request.path, () => files.move(request))
      },
      commitBatch: request => {
        seen.push(...request.entries.map((entry: Path) => entry.path))
        return files.commitBatch(request)
      },
    },
  }
  return { fixture, environment, seen }
}

it('lists "." as the workspace root itself', async () => {
  // Red if "." reaches the facility unresolved: the host answers invalidInput.
  const host = hostLike('/work', { '/work/qa-note.txt': 'note' })
  const author = value(createFilesAuthor(construction('/work')))
  const text = await run(author, 'list', { path: '.' }, host.environment)
  expect(host.seen).toEqual(['/work'])
  expect(text).toMatch(/^done /u)
  expect(text).toContain('path="." resolved_path="/work"')
  expect(text).toContain('"qa-note.txt"	file')
})

it('reads a sub path under the workspace root', async () => {
  // Red if a relative path is joined incorrectly or not at all.
  const host = hostLike('/work', { '/work/sub/file.txt': 'inside' })
  const author = value(createFilesAuthor(construction('/work')))
  const text = await run(author, 'read', { path: 'sub/file.txt' }, host.environment)
  expect(host.seen).toEqual(['/work/sub/file.txt'])
  expect(text).toMatch(/^done /u)
  expect(text.endsWith('\ninside')).toBe(true)
})

it('resolves Windows workspace roots with Windows separators', async () => {
  // Red if resolution follows the test process instead of the workspace root's own flavor.
  const host = hostLike('C:\\work', { 'C:\\work\\sub\\file.txt': 'windows' }, '\\')
  const author = value(createFilesAuthor(construction('C:\\work')))
  const text = await run(author, 'read', { path: 'sub/file.txt' }, host.environment)
  expect(host.seen).toEqual(['C:\\work\\sub\\file.txt'])
  expect(text.endsWith('\nwindows')).toBe(true)
})

it('passes a path that leaves the workspace to the existing refusal', async () => {
  // Red if resolution answers success for "..", or if the author skips the facility guard.
  const host = hostLike('/work', { '/outside.txt': 'secret' })
  const author = value(createFilesAuthor(construction('/work')))
  const text = await run(author, 'read', { path: '../outside.txt' }, host.environment)
  expect(host.seen).toEqual(['/outside.txt'])
  expect(text).toBe('rejected request="host" reason=notAuthorized')
  expect(text).not.toContain('secret')
})

it('keeps absolute paths unchanged', async () => {
  // Red if an absolute path is rewritten against the workspace root.
  const host = hostLike('/work', { '/work/a.txt': 'a', '/etc/passwd': 'root' })
  const author = value(createFilesAuthor(construction('/work')))
  const inside = await run(author, 'read', { path: '/work/a.txt' }, host.environment)
  const outside = await run(author, 'read', { path: '/etc/passwd' }, host.environment)
  expect(host.seen).toEqual(['/work/a.txt', '/etc/passwd'])
  expect(inside).toContain('path="/work/a.txt" version=')
  expect(inside).not.toContain('resolved_path')
  expect(outside).toBe('rejected request="host" reason=notAuthorized')
})

it('without a workspace root answers invalidInput and says an absolute path is needed', async () => {
  // Red if the relative path is guessed into some root, or if the refusal carries no diagnostic.
  const host = hostLike('/work', { '/work/qa-note.txt': 'note' })
  const author = value(createFilesAuthor(construction()))
  const text = await run(author, 'read', { path: 'qa-note.txt' }, host.environment)
  expect(host.seen).toEqual(['qa-note.txt'])
  expect(text).toMatch(/^rejected request="host" reason=invalidInput\n/u)
  expect(text).toContain('Use an absolute path.')
  const absolute = await run(author, 'read', { path: '/work/qa-note.txt' }, host.environment)
  expect(absolute).not.toContain('Use an absolute path.')
})

it('resolves move targets and patch entries the same way', async () => {
  // Red if only the primary `path` is resolved and a second path reaches the facility relative.
  const host = hostLike('/work', { '/work/a.txt': 'old' })
  const author = value(createFilesAuthor(construction('/work')))
  await run(author, 'move', { path: 'a.txt', target: 'b.txt' }, host.environment)
  await run(
    author,
    'patch',
    { edits: [{ path: 'a.txt', old_text: 'old', new_text: 'new' }] },
    host.environment,
  )
  expect(host.seen).toEqual(['/work/b.txt', '/work/a.txt', '/work/a.txt', '/work/a.txt'])
})

it('refuses a working directory that is not absolute', () => {
  // Red if a relative root is accepted and later resolves against the server process.
  expect(createFilesAuthor(construction('work'))).toHaveProperty('failure')
})
