// @module-tag source-text
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const CATEGORY_NAMES = /\b(?:skills?|mcps?|tools?)\b/i

it('the source names no concrete asset category', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const named = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .flatMap(entry => {
      const path = join(entry.parentPath, entry.name)
      return readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          CATEGORY_NAMES.test(line)
            ? [`${path.slice(root.length)}:${index + 1}: ${line.trim()}`]
            : [],
        )
    })
  expect(named).toEqual([])
})
