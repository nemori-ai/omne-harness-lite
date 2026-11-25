import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const GROUP = join(import.meta.dirname, '../..')
const MEMBERS = [
  'slash-command-contract',
  'slash-command',
  'slash-command-cordis-contract',
  'slash-command-protocol',
  'slash-command-access',
  'slash-command-ui',
]
const NAMES = [
  'select-model',
  'change-permission-mode',
  'archive-session',
  'reload-session',
  "'model'",
  "'permission'",
  "'archive'",
  "'reload'",
  'omne-official:',
]

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/u.test(entry.name) ? [path] : []
  })
}

describe('the command domain knows no command and no operation', () => {
  it('no source file of its members names a command or an operation of another domain', () => {
    const found = MEMBERS.flatMap(member =>
      sources(join(GROUP, member, 'src')).flatMap(path => {
        const text = readFileSync(path, 'utf8')
        return NAMES.filter(name => text.includes(name)).map(name => `${path}: ${name}`)
      }),
    )
    expect(found).toEqual([])
    expect(MEMBERS.every(member => sources(join(GROUP, member, 'src')).length > 0)).toBe(true)
  })
})
