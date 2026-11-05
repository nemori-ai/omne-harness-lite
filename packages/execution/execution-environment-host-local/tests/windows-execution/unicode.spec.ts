/** @module-tag slow */
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

it('preserves Unicode paths, arguments and explicit environment values', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-汉字-')))
  const { manager, request } = commandFixture(root)
  try {
    const result = await manager.facility.start({
      ...request,
      args: [
        '-e',
        'process.stdout.write(JSON.stringify([process.argv[1],process.env.OMNE_VALUE,process.cwd()]))',
        '中文🙂',
      ],
      env: { ...request.env, OMNE_VALUE: '值🙂' },
    })
    expect(result.kind).toBe('done')
    if (result.kind !== 'done') return
    const chunks: Uint8Array[] = []
    for await (const chunk of result.value.output) chunks.push(chunk.data)
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual(['中文🙂', '值🙂', root])
    expect(await result.value.result).toMatchObject({ kind: 'completed' })
  } finally {
    await manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
