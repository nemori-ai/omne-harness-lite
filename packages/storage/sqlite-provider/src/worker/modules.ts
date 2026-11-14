import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export class MaterialMismatch extends Error {}

export class ModuleCache {
  private readonly loaded = new Map<string, Promise<unknown>>()

  load<T>(moduleUrl: string, digest: string): Promise<T> {
    const key = `${digest}:${moduleUrl}`
    let module = this.loaded.get(key)
    if (module === undefined) {
      module = this.read(moduleUrl, digest)
      this.loaded.set(key, module)
      module.catch(() => this.loaded.delete(key))
    }
    return module as Promise<T>
  }

  private async read(moduleUrl: string, digest: string): Promise<unknown> {
    const url = new URL(moduleUrl)
    if (url.protocol !== 'file:') throw new MaterialMismatch('module url is not a file url')
    const bytes = await readFile(fileURLToPath(url))
    if (createHash('sha256').update(bytes).digest('hex') !== digest)
      throw new MaterialMismatch('module file does not match its digest')
    const imported = (await import(/* @vite-ignore */ moduleUrl)) as { default: unknown }
    return imported.default
  }
}
