import type { FacilityResult, FilesScope } from '@omne-harness/execution-environment-contract'
import { describe, expect, it } from 'vitest'
import { createFilesAuthor, type FilesAuthorEnvironment } from '@omne-harness/tool-definitions'
import { filesConstruction, filesFixture } from './fixtures/files.ts'
import { run, runRaw, value } from './run-author.ts'

const SETTING = 'the setting for files outside the workspace keeps this call from'

/** A fence that refuses whatever is not under `/work`, and refuses `/work/locked` for its own reason. */
function fenced(
  scope: FilesScope | undefined,
  reason: 'notAuthorized' | 'invalidInput' = 'notAuthorized',
) {
  const fixture = filesFixture({ '/work/a.txt': 'a', '/etc/passwd': 'root' })
  const files = fixture.environment.files
  const gate = <T>(paths: readonly string[], answer: () => Promise<FacilityResult<T>>) =>
    paths.every(path => path.startsWith('/work/') && path !== '/work/locked')
      ? answer()
      : Promise.resolve({ kind: 'rejected', requestId: 'host', reason } as const)
  const environment: FilesAuthorEnvironment = {
    directory: '/work',
    media: fixture.environment.media,
    ...(scope === undefined ? {} : { scope }),
    files: {
      ...files,
      read: request => gate([request.path], () => files.read(request)),
      write: request => gate([request.path], () => files.write(request)),
      move: request => gate([request.path, request.target.path], () => files.move(request)),
      copy: request => gate([request.path, request.target.path], () => files.copy(request)),
    },
  }
  return environment
}

const author = value(createFilesAuthor(filesConstruction()))
const read = (environment: FilesAuthorEnvironment, path: string) =>
  run(author, 'read', { path }, environment)

describe('a refusal of the fence, said by the files this call may reach', () => {
  it('names the path, the effect and the setting when the path is outside the scope', async () => {
    const both = fenced({ read: '/work', write: '/work' })
    expect(await read(both, '/etc/passwd')).toBe(
      `rejected request="host" reason=outsideScope path="/etc/passwd" effect=read ${SETTING} reading there`,
    )
    expect(
      await run(author, 'write', { path: '../out.txt', text: 'x', mode: 'create' }, both),
    ).toBe(
      `rejected request="host" reason=outsideScope path="/out.txt" effect=write ${SETTING} writing there`,
    )
  })

  it('names the path of an open outside the scope: opening a picture reads it', async () => {
    const both = fenced({ read: '/work', write: '/work' })
    const opened = (await runRaw(author, 'open', { path: '/etc/passwd' }, both)) as Readonly<{
      content: readonly Readonly<{ kind: string; text?: string }>[]
    }>
    expect(opened.content.map(block => block.text).join('')).toContain(
      `rejected request="host" reason=outsideScope path="/etc/passwd" effect=read ${SETTING} reading there`,
    )
  })

  it('names the target of a move when the source may be written and the target may not', async () => {
    const reads = fenced({ write: '/work' })
    expect(await run(author, 'move', { path: '/work/a.txt', target: '/tmp/a.txt' }, reads)).toBe(
      `rejected request="host" reason=outsideScope path="/tmp/a.txt" effect=write ${SETTING} writing there`,
    )
  })

  it('names the source of a move outside the write root, since a move takes its source away', async () => {
    const reads = fenced({ write: '/work' })
    expect(await run(author, 'move', { path: '/tmp/a.txt', target: '/work/a.txt' }, reads)).toBe(
      `rejected request="host" reason=outsideScope path="/tmp/a.txt" effect=write ${SETTING} writing there`,
    )
    expect(await run(author, 'copy', { path: '/tmp/a.txt', target: '/work/a.txt' }, reads)).toBe(
      'rejected request="host" reason=notAuthorized',
    )
  })

  it('leaves the refusal as it is when the scope does not explain it', async () => {
    const reads = fenced({ write: '/work' })
    expect(await read(reads, '/etc/passwd')).toBe('rejected request="host" reason=notAuthorized')
    expect(await read(fenced({ read: '/work' }), '/work/locked')).toBe(
      'rejected request="host" reason=notAuthorized',
    )
  })

  it('leaves it as it is without a scope, or for a refusal of another kind', async () => {
    expect(await read(fenced(undefined), '/etc/passwd')).toBe(
      'rejected request="host" reason=notAuthorized',
    )
    expect(await read(fenced({ read: '/work' }, 'invalidInput'), '/etc/passwd')).toBe(
      'rejected request="host" reason=invalidInput',
    )
  })

  it('does not touch an answer that is done', async () => {
    expect(await read(fenced({ read: '/work' }), '/work/a.txt')).toMatch(/^done /u)
  })
})
