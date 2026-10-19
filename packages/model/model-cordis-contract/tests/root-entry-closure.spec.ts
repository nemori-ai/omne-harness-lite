import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import { expect, it } from 'vitest'

// The root entry must not reach Cordis, directly or through a leaf file. The check walks the
// relative imports of the built entry, so a type re-export from a leaf that imports Cordis is found.
const dist = fileURLToPath(new URL('../dist/', import.meta.url))

function reach(entry: string, suffix: string): { files: string[]; specifiers: string[] } {
  const files: string[] = []
  const specifiers: string[] = []
  const pending = [resolve(dist, entry)]
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || files.includes(file)) continue
    files.push(file)
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true)
      .importedFiles) {
      specifiers.push(fileName)
      if (fileName.startsWith('.'))
        pending.push(resolve(dirname(file), fileName.replace(/\.(js|ts)$/, suffix)))
    }
  }
  return { files: files.map(file => file.slice(dist.length)).sort(), specifiers }
}

it('has a built root module that imports nothing at run time', () => {
  expect(reach('index.js', '.js')).toEqual({ files: ['index.js'], specifiers: [] })
})

it('has a built root declaration that reaches the registration types and never Cordis', () => {
  const { files, specifiers } = reach('index.d.ts', '.d.ts')

  expect(files).toContain('registration.d.ts')
  expect(specifiers.filter(name => name.startsWith('@deepseek-ai/cordis'))).toEqual([])
  expect(files.filter(file => /^(cordis|converters)\./.test(file))).toEqual([])
})
