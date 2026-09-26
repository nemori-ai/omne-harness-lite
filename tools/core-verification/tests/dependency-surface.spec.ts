import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { dependencySurface, moduleSpecifiers } from '../src/dependency-surface.ts'

const repository = fileURLToPath(new URL('../../../', import.meta.url))

it('w1.consumer.dependency-parser-detects-forbidden-edges', () => {
  expect(
    moduleSpecifiers(`
    // import 'ignored-comment'
    import type { Context } from '@deepseek-ai/cordis'
    export type { Parsed } from '@omne-harness-lite/identity-values'
    const requireValue = require('@omne-harness-lite/storage')
    const later = import('@omne-harness-lite/kernel-basis/testing')
    type Factory = typeof import('@standard-schema/spec')
  `),
  ).toEqual([
    '@deepseek-ai/cordis',
    '@omne-harness-lite/identity-values',
    '@omne-harness-lite/kernel-basis/testing',
    '@omne-harness-lite/storage',
    '@standard-schema/spec',
  ])
  expect(moduleSpecifiers(`import { fail } from '@omne-harness-lite/kernel-basis'`)).toEqual([
    '@omne-harness-lite/kernel-basis',
  ])
  expect(() => moduleSpecifiers('const value = import(name)')).toThrow(/computed module specifier/)
})

it('w1.consumer.adopted-dependency-exceptions', async () => {
  const root = (node: string, file: string) => join(repository, 'packages/core', node, file)
  const kernelSource = await dependencySurface(root('kernel-basis', 'src/index.ts'))
  const kernelDeclarations = await dependencySurface(root('kernel-basis', 'dist/index.d.ts'), true)
  const kernelRuntime = await dependencySurface(root('kernel-basis', 'dist/index.js'))
  expect(kernelSource.external).toEqual(['@deepseek-ai/cordis', '@standard-schema/spec'])
  expect(kernelDeclarations.external).toEqual(kernelSource.external)
  expect(kernelRuntime.external).toEqual([])
  const kernelTesting = await dependencySurface(root('kernel-basis', 'dist/testing/index.js'))
  expect(kernelTesting.external).toEqual(['@deepseek-ai/cordis'])

  const storageSource = await dependencySurface(root('storage', 'src/index.ts'))
  const storageDeclarations = await dependencySurface(root('storage', 'dist/index.d.ts'), true)
  const storageRuntime = await dependencySurface(root('storage', 'dist/index.js'))
  expect(storageSource.external).toEqual(['kysely', 'kysely/migration', 'node:util'])
  expect(storageDeclarations.external).toEqual(['kysely', 'kysely/migration'])
  expect(storageRuntime.external).toEqual(['node:util'])
  const storageConformance = await dependencySurface(root('storage', 'dist/conformance/index.js'))
  // D-057 将测试运行器显式传入；产品套件不得运行时导入 Vitest。
  expect(storageConformance.external).toEqual(['kysely'])

  const directory = join(repository, 'tmp/w1-public-consumers')
  await mkdir(directory, { recursive: true })
  const run = await mkdtemp(join(directory, 'dependencies-'))
  await writeFile(
    join(run, 'report.json'),
    JSON.stringify(
      {
        kernelSource,
        kernelDeclarations,
        kernelRuntime,
        kernelTesting,
        storageSource,
        storageDeclarations,
        storageRuntime,
        storageConformance,
      },
      null,
      2,
    ) + '\n',
  )
})
