import * as runner from 'vitest'
import { bootAssembly, type Assembly } from '@omne-harness-lite/kernel-basis/testing'
import {
  describeAtomicStorageConformance,
  describeStorageConformance,
} from '@omne-harness-lite/storage/conformance'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { SqlStorageService } from '../src/cordis.ts'
import { openStorage, type SqlStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

const resources: { assembly: Assembly; raw: SqlStorage }[] = []
runner.afterAll(async () => {
  for (const { assembly, raw } of resources.splice(0).reverse()) {
    await assembly.dispose()
    await raw.close()
  }
})

function factory(file: string, synchronous: 'normal' | 'full') {
  return async () => {
    const raw = await openStorage({ dialect: 'sqlite', file, synchronous, upgrade: false })
    const assembly = await bootAssembly({
      plugins: [
        {
          plugin: {
            name: 'storage-sql-test-binding',
            apply(ctx) {
              new SqlStorageService(ctx, raw)
            },
          },
        },
      ],
    })
    resources.push({ assembly, raw })
    return assembly.ctx.get(STORAGE_SERVICE) as SqlStorageService
  }
}

for (const synchronous of ['normal', 'full'] as const) {
  describeStorageConformance(
    `SqlStorageService ${synchronous}`,
    factory(tempSqliteFile(`service-${synchronous}`), synchronous),
    runner,
  )
}
describeAtomicStorageConformance(
  'SqlStorageService FULL',
  factory(tempSqliteFile('service-atomic'), 'full'),
  runner,
)
