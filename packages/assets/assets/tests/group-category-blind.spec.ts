// @module-tag source-text
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const CATEGORY_LITERAL = /(['"`])(?:tool|model-provider|skill|mcp|AgentDefinition)\1/

it('no member of the asset group names a concrete category in its source', () => {
  const group = fileURLToPath(new URL('../../', import.meta.url))
  const members = readdirSync(group, { withFileTypes: true }).filter(entry => entry.isDirectory())
  expect(members.length).toBeGreaterThan(5)
  const named = members.flatMap(member =>
    readdirSync(join(group, member.name, 'src'), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name))
      .flatMap(entry => {
        const path = join(entry.parentPath, entry.name)
        return readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            CATEGORY_LITERAL.test(line) ? [`${path.slice(group.length)}:${index + 1}`] : [],
          )
      }),
  )
  expect(named).toEqual([])
})
