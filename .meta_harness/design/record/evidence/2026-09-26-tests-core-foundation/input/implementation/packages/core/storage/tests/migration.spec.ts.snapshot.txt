import { describe, expect, it } from 'vitest'
import type { Migration } from 'kysely/migration'
import { composeMigrations, composedMigrationName, type MigrationFragment } from '../src/index.ts'

const m: Migration = { async up() {} }

describe('composeMigrations', () => {
  it('按数组次序给四位编号，名字 = 编号_片段名', async () => {
    const provider = composeMigrations([
      { name: 'account', migration: m },
      { name: 'organization', migration: m },
    ])
    expect(Object.keys(await provider.getMigrations())).toEqual([
      '0001_account',
      '0002_organization',
    ])
    expect(composedMigrationName(12, { name: 'x', migration: m })).toBe('0012_x')
  })
  it('同名片段拒绝合成，不静默覆盖', () => {
    const dup: MigrationFragment[] = [
      { name: 'a', migration: m },
      { name: 'a', migration: m },
    ]
    expect(() => composeMigrations(dup)).toThrow(/duplicate migration fragment name: a/)
  })
})
