// electron-builder's artifactBuildCompleted runs after signing: it binds the NSIS installer to the
// exact executable and app.asar of each payload, so `verify:release --no-build` checks what ships.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ArtifactCreated } from 'electron-builder'

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function receipt(installer: string, executable: string): Promise<string> {
  const files = [installer, executable, join(dirname(executable), 'resources', 'app.asar')]
  return `${(await Promise.all(files.map(digest))).join('\n')}\n`
}

const receiptFile = (installer: string, arch: string) => `${installer}.${arch}.sha256`

export async function recordInstaller(installer: string, arch: string, executable: string) {
  await writeFile(receiptFile(installer, arch), await receipt(installer, executable))
}

/** Throws unless the installer, executable and app.asar are those recorded when it was built. */
export async function checkInstaller(installer: string, arch: string, executable: string) {
  const recorded = await readFile(receiptFile(installer, arch), 'utf8')
  if (recorded !== (await receipt(installer, executable)))
    throw new Error(
      'the NSIS installer, the application executable and app.asar do not match the recorded distribution build',
    )
}

export default async function artifactBuildCompleted({
  file,
  target,
  arch,
  packager,
}: ArtifactCreated): Promise<void> {
  if (target?.name !== 'nsis' || !file.endsWith('.exe')) return
  // NsisTarget keeps the appOutDir it built each architecture from.
  const directories: unknown = Reflect.get(target, 'archs')
  if (!(directories instanceof Map)) throw new Error('missing NSIS payload directories')
  const { Arch } = await import('electron-builder')
  const selected: Map<unknown, unknown> =
    arch === null ? directories : new Map([[arch, directories.get(arch)]])
  if (selected.size === 0) throw new Error('empty NSIS payload list')
  for (const [payloadArch, directory] of selected) {
    if (typeof payloadArch !== 'number' || !Arch[payloadArch] || typeof directory !== 'string')
      throw new Error('invalid NSIS payload directory')
    await recordInstaller(
      file,
      Arch[payloadArch],
      join(directory, `${packager.appInfo.productFilename}.exe`),
    )
  }
}
