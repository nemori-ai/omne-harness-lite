import { spawn } from 'node:child_process'
import { readlink, type FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { filesHelper } from './macos-files/transport.ts'

async function descriptorPath(fd: number): Promise<Buffer | undefined> {
  if (process.platform === 'linux') return readlink(`/proc/self/fd/${fd}`, { encoding: 'buffer' })
  if (process.platform !== 'darwin') return undefined
  const helper = await filesHelper()
  if (helper.kind !== 'ready') return undefined
  const child = spawn(helper.path, ['--descriptor-path'], {
    stdio: ['ignore', 'pipe', 'ignore', fd],
    timeout: 5000,
  })
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.once('error', reject)
    child.once('close', code => resolve(code === 0 ? Buffer.concat(chunks) : undefined))
  })
}

/** Ask the kernel about the descriptor being used. Ambiguous or unavailable names supply no proof. */
export async function openFileDirectory(
  handle: FileHandle,
  observe?: true,
): Promise<{ verifiedDirectories?: string[] }> {
  if (!observe) return {}
  try {
    const bytes = await descriptorPath(handle.fd)
    if (bytes === undefined) return {}
    const path = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (!isAbsolute(path) || (process.platform === 'linux' && path.endsWith(' (deleted)')))
      return {}
    const stat = await handle.stat({ bigint: true })
    if (stat.isDirectory() && stat.nlink > 0n) return { verifiedDirectories: [path] }
    if (stat.isFile() && stat.nlink === 1n) return { verifiedDirectories: [dirname(path)] }
  } catch {
    // An optional observation cannot change the outcome of the original operation.
  }
  return {}
}

export async function openDirectories(handles: Iterable<FileHandle>, observe?: true) {
  const directories = new Set<string>()
  if (observe) {
    for (const handle of handles) {
      const proof = await openFileDirectory(handle, observe)
      for (const directory of proof.verifiedDirectories ?? []) directories.add(directory)
    }
  }
  return directories.size ? { verifiedDirectories: [...directories].sort() } : {}
}
