import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE = join(import.meta.dirname, '../src')

describe('the session access plugin does no command of its own', () => {
  it('names no command and keeps no table from commands to operations: a command is done as the operation it asks for', () => {
    const files = readdirSync(SOURCE).filter(name => name.endsWith('.ts'))
    expect(files).not.toContain('command-operations.ts')
    const found = files.flatMap(name => {
      const text = readFileSync(join(SOURCE, name), 'utf8')
      return ['omne-official', 'PERMISSION_MODES', 'name one mode', 'name one model']
        .filter(word => text.includes(word))
        .map(word => `${name}: ${word}`)
    })
    expect(found).toEqual([])
  })
})
