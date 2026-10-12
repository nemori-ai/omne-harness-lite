// @module-tag slow — Real temporary host files, original batches and resources.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { createSharpImageCodec } from '@omne-harness-lite/image-codec'
import { expect, test } from 'vitest'
import { createFilesTool } from '../src/index.ts'
import { options, text } from './fixture.ts'
import { hostFixture } from './host-fixture.ts'

test('public Files body uses the injected real host for reads, edits, batches, pages and path operations', async () => {
  const h = await hostFixture(),
    tool = createFilesTool(options, { imageCodec: createSharpImageCodec(sharp) }),
    call = await h.acquire()
  const run = (command: string, args: import('@omne-harness-lite/content-blocks').JsonObject) =>
    tool.executor({ command, args }, call.deps)
  async function version(path: string) {
    const observed = await call.deps.environment!.files!.stat(join(h.directory, path))
    if (observed.kind !== 'stat') throw new Error(observed.reason)
    return observed.value.version
  }
  try {
    expect(text(await run('mkdir', { path: 'nested', parents: false }))).toContain('OK:')
    expect(
      text(
        await run('write', {
          path: 'a',
          content: 'old\r\nsecond',
          encoding: 'utf8',
          mode: 'create',
        }),
      ),
    ).toContain('OK:')
    expect(text(await run('read', { path: 'a' }))).toContain('old')
    const edited = await run('edit', {
      path: 'a',
      expectedVersion: await version('a'),
      match: { text: 'old' },
      replacement: '新',
    })
    expect(text(edited)).toContain('CONFIRMED DIFF')
    expect(await readFile(join(h.directory, 'a'), 'utf8')).toBe('新\r\nsecond')
    await writeFile(join(h.directory, 'b'), 'original')
    const va = await version('a'),
      vb = await version('b')
    const patch = [
      { path: 'a', expectedVersion: va, edits: [{ match: { text: '新' }, replacement: 'final' }] },
      {
        path: 'b',
        expectedVersion: vb,
        edits: [{ match: { text: 'missing' }, replacement: 'after' }],
      },
    ]
    expect(text(await run('patch', { files: patch }))).toContain('No target changes were submitted')
    expect(await readFile(join(h.directory, 'a'), 'utf8')).toBe('新\r\nsecond')
    expect(await readFile(join(h.directory, 'b'), 'utf8')).toBe('original')
    patch[1]!.edits[0]!.match.text = 'original'
    expect(text(await run('patch', { files: patch }))).toContain('Batch commit confirmed')
    expect(await readFile(join(h.directory, 'a'), 'utf8')).toBe('final\r\nsecond')
    expect(await readFile(join(h.directory, 'b'), 'utf8')).toBe('after')
    expect(text(await run('list', { path: '.', limit: 2 }))).toContain('next_offset')
    expect(
      text(await run('find', { root: '.', mode: 'content', pattern: 'final', recursive: false })),
    ).toContain('/a')
    expect(text(await run('info', { path: 'a' }))).toContain('metadata identity')
    expect(text(await run('copy', { from: 'a', to: 'copied', replace: false }))).toContain('OK:')
    expect(
      text(await run('move', { from: 'copied', to: 'nested/moved', replace: false })),
    ).toContain('OK:')
    expect(await readFile(join(h.directory, 'nested/moved'), 'utf8')).toBe('final\r\nsecond')
    expect(text(await run('delete', { path: 'nested', recursive: true }))).toContain('OK:')
    expect(await call.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await h.close()
  }
}, 30000)
