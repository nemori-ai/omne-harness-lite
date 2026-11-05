import { link, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

beforeEach(context => context.skip(process.platform !== 'win32'))

it('creates exclusively and replaces the named object without changing its hard-link alias', async () => {
  await withFiles(async ({ files, root, path, input, bytes }) => {
    const alias = join(root, 'alias.txt')
    await link(path, alias)
    const before = await files.stat(input)
    if (before.kind !== 'done') throw new Error('stat failed')
    const replacement = Buffer.from('新内容\r\n末行')
    expect(
      await files.write({
        ...input,
        mode: 'replace',
        bytes: replacement,
        expectedVersion: 'wrong',
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'conflict' })
    expect(await readFile(path)).toEqual(bytes)
    const written = await files.write({
      ...input,
      mode: 'replace',
      bytes: replacement,
      expectedVersion: before.value.version,
    })
    expect(written).toMatchObject({ kind: 'done', value: { writeEffect: 'replaced' } })
    if (written.kind !== 'done') throw new Error('write failed')
    expect(written.value.object.token).not.toBe(input.named?.token)
    expect(await readFile(alias)).toEqual(bytes)
    expect(await readFile(path)).toEqual(replacement)
    const fresh = request(join(root, 'created.txt'), await hostObjectToken(root))
    expect(await files.write({ ...fresh, mode: 'create', bytes: replacement })).toMatchObject({
      kind: 'done',
      value: { writeEffect: 'created' },
    })
    expect(await files.write({ ...fresh, mode: 'create', bytes })).toMatchObject({
      kind: 'rejected',
      reason: 'conflict',
    })
    expect(await readFile(fresh.path)).toEqual(replacement)
  })
}, 30_000)
