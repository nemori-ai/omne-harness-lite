import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import { expect, it } from 'vitest'
import { bodyA, createFixture, login, refA, tenant } from './support.ts'
import type {
  ModelReplicaOptions,
  StoreBoundReplicaInput,
  StoreBoundReplicaResult,
  ReadCredentialBindingIn,
  BoundReplicaRead,
} from '../src/model-replica.ts'
import type { ReadBoundReplicaIn } from '@omne-harness-lite/model-profile-directory'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
interface LiteralModule {
  publishOnce(
    options: ModelReplicaOptions,
    input: StoreBoundReplicaInput,
  ): Promise<StoreBoundReplicaResult>
  readInP1r(
    storage: AtomicStorage,
    binding: ReadCredentialBindingIn,
    read: ReadBoundReplicaIn,
    tenant: TenantId,
  ): Promise<BoundReplicaRead>
}

for (const readme of ['README.md', 'README_ZH.md']) {
  it(`runs every exact TypeScript literal in ${readme} through built public exports`, async () => {
    const f = await createFixture()
    const output = join(packageRoot, 'tmp', 'literals', readme)
    await mkdir(output, { recursive: true })
    try {
      const markdown = await readFile(join(packageRoot, readme), 'utf8')
      const blocks = [...markdown.matchAll(/```ts\n([\s\S]*?)\n```/gu)].map(m => m[1])
      expect(blocks.length).toBe(3)
      const modules: LiteralModule[] = []
      for (const [i, block] of blocks.entries()) {
        if (block === undefined) throw new Error('literal missing')
        const source = join(output, `${i}.mts`)
        await writeFile(source, block)
        const compiled = transpileModule(block, {
          compilerOptions: { target: ScriptTarget.ES2024, module: ModuleKind.ESNext },
        })
        const artifact = join(output, `${i}.mjs`)
        await writeFile(artifact, compiled.outputText)
        const module: LiteralModule = await import(pathToFileURL(artifact).href)
        modules.push(module)
      }
      const publishing = modules[1]
      const reading = modules[2]
      if (publishing === undefined || reading === undefined) throw new Error('literals missing')
      await f.bind(refA)
      expect(
        await publishing.publishOnce(
          {
            storage: f.storage,
            clock: f.clock,
            keyFile: f.keyFile,
            readCredentialBindingIn: f.reader,
            diagnostics: f.diagnostics,
          },
          { tenant, loginState: login, sourceRef: refA, body: bodyA },
        ),
      ).toEqual({ stored: true, tenant })
      expect(
        await reading.readInP1r(f.storage, f.reader, f.component.readBoundReplicaIn, tenant),
      ).toEqual({ body: bodyA })
    } finally {
      await f.cleanup()
      await rm(output, { recursive: true, force: true })
    }
  })
}
