import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { inventory } from '@omne-harness-lite/artifact-builder'
import { buildTenancyImage, verifyHostApp } from '../tools/docker-image.ts'

const scratch = new URL('../../../tmp/docker-delivery/', import.meta.url).pathname
const roots: string[] = []

async function fixture(): Promise<string> {
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, 'test-image-'))
  roots.push(root)
  const app = join(root, 'app')
  await mkdir(join(app, 'dist'), { recursive: true })
  await writeFile(
    join(app, 'package.json'),
    '{"name":"@omne-harness-lite/tenancy-host","version":"0.0.0"}\n',
  )
  await writeFile(join(app, 'dist/cli.js'), 'process.stdout.write("ready\\n")\n')
  await manifest(app)
  return app
}

async function manifest(app: string): Promise<void> {
  const files = (await inventory(app)).filter(
    entry => entry.path !== 'BUILD_ID' && entry.path !== 'build-info.json',
  )
  const buildId = createHash('sha256').update(JSON.stringify(files)).digest('hex')
  await writeFile(join(app, 'BUILD_ID'), `${buildId}\n`)
  await writeFile(
    join(app, 'build-info.json'),
    `${JSON.stringify({
      format: 'omne-tenancy-host-build/1',
      version: '0.0.0',
      node: '24.21.0',
      pnpm: '10.28.1',
      buildId,
      files,
    })}\n`,
  )
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('accepts the exact manifest and rejects changed, missing, and extra files', async () => {
  const app = await fixture()
  const verified = await verifyHostApp(app)
  expect(verified.buildId).toMatch(/^[0-9a-f]{64}$/)
  await writeFile(join(app, 'dist/cli.js'), 'changed')
  await expect(verifyHostApp(app)).rejects.toThrow('app-files-mismatch')
  await writeFile(join(app, 'dist/cli.js'), 'process.stdout.write("ready\\n")\n')
  await writeFile(join(app, 'extra.txt'), 'extra')
  await expect(verifyHostApp(app)).rejects.toThrow('app-files-mismatch')
  await unlink(join(app, 'extra.txt'))
  await unlink(join(app, 'dist/cli.js'))
  await expect(verifyHostApp(app)).rejects.toThrow('app-files-mismatch')
})

it('rejects an external symlink and a special filesystem object', async () => {
  const app = await fixture()
  await symlink('/etc/hosts', join(app, 'external'))
  await expect(verifyHostApp(app)).rejects.toThrow('unsafe-artifact-link')
  await unlink(join(app, 'external'))
  execFileSync('mkfifo', [join(app, 'fifo')])
  await expect(verifyHostApp(app)).rejects.toThrow('unsafe-artifact-file')
})

it('rejects a native executable even when its manifest is internally consistent', async () => {
  const app = await fixture()
  await writeFile(join(app, 'dist/native.bin'), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]))
  await manifest(app)
  await expect(verifyHostApp(app)).rejects.toThrow('nonportable-or-private-app-file')
})

it('preserves an occupied output without calling Docker', async () => {
  const app = await fixture()
  const output = join(app, '../occupied.tar')
  await writeFile(output, 'existing')
  await expect(buildTenancyImage(app, 'linux/arm64', output)).rejects.toThrow('output-exists')
  expect(await readFile(output, 'utf8')).toBe('existing')
})

it('rejects an archive from a different deployment revision before calling Docker', async () => {
  const app = await fixture()
  const output = join(app, '../new.tar')
  await expect(buildTenancyImage(app, 'linux/arm64', output)).rejects.toThrow(
    'deployment-files-mismatch',
  )
})
