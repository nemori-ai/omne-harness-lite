// Loading of participant, migration and handler modules inside the Worker (SPEC 4.1). The Worker
// checks the digest of the file bytes once more before it imports the module. A digest that does
// not match means that the build and the files differ, so the domain is quarantined.
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
      // A failed load is not cached, so a repaired file can load later.
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
