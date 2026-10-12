import { describe, expect, it } from 'vitest'
import {
  checkSnapshotTables,
  type SnapshotColumn,
  type SnapshotIndex,
  type SnapshotForeignKey,
  type SnapshotStructure,
  type SnapshotTable,
} from '../src/index.ts'

const expected: readonly SnapshotTable[] = [
  {
    name: 'owner_child',
    definition:
      'CREATE TABLE owner_child (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT NOT NULL REFERENCES owner_parent(id) ON DELETE RESTRICT, fallback TEXT REFERENCES owner_parent)',
    columns: [
      {
        name: 'id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
      {
        name: 'parent_id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 0,
      },
      {
        name: 'fallback',
        type: 'TEXT',
        notNull: false,
        primaryKeyPosition: 0,
      },
    ],
    indexes: [
      {
        name: 'owner_child_composite',
        unique: true,
        partial: false,
        columns: ['parent_id', 'id'],
        definition: 'CREATE UNIQUE INDEX owner_child_composite ON owner_child(parent_id,id)',
      },
      {
        name: 'owner_child_expression',
        unique: false,
        partial: true,
        columns: [null],
        definition:
          'CREATE INDEX owner_child_expression ON owner_child(lower(id)) WHERE parent_id IS NOT NULL',
      },
      {
        name: 'sqlite_autoindex_owner_child_1',
        unique: true,
        partial: false,
        columns: ['id'],
        definition: null,
      },
    ],
    foreignKeys: [
      {
        table: 'owner_parent',
        from: ['parent_id'],
        to: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      {
        table: 'owner_parent',
        from: ['fallback'],
        to: [null],
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
      },
    ],
  },
  {
    name: 'owner_parent',
    definition: 'CREATE TABLE owner_parent (id TEXT PRIMARY KEY NOT NULL)',
    columns: [
      {
        name: 'id',
        type: 'TEXT',
        notNull: true,
        primaryKeyPosition: 1,
      },
    ],
    indexes: [
      {
        name: 'sqlite_autoindex_owner_parent_1',
        unique: true,
        partial: false,
        columns: ['id'],
        definition: null,
      },
    ],
    foreignKeys: [],
  },
]

function actualStructure(): SnapshotStructure {
  return {
    tables: [
      {
        name: 'owner_child',
        definition:
          'CREATE TABLE owner_child (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT NOT NULL REFERENCES owner_parent(id) ON DELETE RESTRICT, fallback TEXT REFERENCES owner_parent)',
        columns: [
          {
            name: 'id',
            type: 'TEXT',
            notNull: true,
            primaryKeyPosition: 1,
          },
          {
            name: 'parent_id',
            type: 'TEXT',
            notNull: true,
            primaryKeyPosition: 0,
          },
          {
            name: 'fallback',
            type: 'TEXT',
            notNull: false,
            primaryKeyPosition: 0,
          },
        ],
        indexes: [
          {
            name: 'owner_child_composite',
            unique: true,
            partial: false,
            columns: ['parent_id', 'id'],
            definition: 'CREATE UNIQUE INDEX owner_child_composite ON owner_child(parent_id,id)',
          },
          {
            name: 'owner_child_expression',
            unique: false,
            partial: true,
            columns: [null],
            definition:
              'CREATE INDEX owner_child_expression ON owner_child(lower(id)) WHERE parent_id IS NOT NULL',
          },
          {
            name: 'sqlite_autoindex_owner_child_1',
            unique: true,
            partial: false,
            columns: ['id'],
            definition: null,
          },
        ],
        foreignKeys: [
          {
            table: 'owner_parent',
            from: ['parent_id'],
            to: ['id'],
            onUpdate: 'NO ACTION',
            onDelete: 'RESTRICT',
          },
          {
            table: 'owner_parent',
            from: ['fallback'],
            to: [null],
            onUpdate: 'NO ACTION',
            onDelete: 'NO ACTION',
          },
        ],
      },
      {
        name: 'owner_parent',
        definition: 'CREATE TABLE owner_parent (id TEXT PRIMARY KEY NOT NULL)',
        columns: [
          {
            name: 'id',
            type: 'TEXT',
            notNull: true,
            primaryKeyPosition: 1,
          },
        ],
        indexes: [
          {
            name: 'sqlite_autoindex_owner_parent_1',
            unique: true,
            partial: false,
            columns: ['id'],
            definition: null,
          },
        ],
        foreignKeys: [],
      },
    ],
    views: [],
    triggers: [],
  }
}

function reversedStructure(): SnapshotStructure {
  const actual = actualStructure()
  return {
    ...actual,
    tables: actual.tables.toReversed().map(table => ({
      ...table,
      columns: table.columns.toReversed(),
      indexes: table.indexes.toReversed(),
      foreignKeys: table.foreignKeys.toReversed(),
    })),
  }
}

function freezeStructure(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  for (const child of Object.values(value)) freezeStructure(child)
  Object.freeze(value)
}

const check = 'owner-child-structure'
const failure = {
  ok: false,
  check: 'owner-child-structure',
  detail: 'the snapshot does not have the expected owner structure',
}

describe('checkSnapshotTables', () => {
  it('exact', () => {
    expect(checkSnapshotTables({ structure: actualStructure() }, expected, check)).toEqual({
      ok: true,
    })
  })

  it('empty-expected', () => {
    expect(checkSnapshotTables({ structure: actualStructure() }, [], check)).toEqual({ ok: true })
  })

  it('order-only', () => {
    expect(checkSnapshotTables({ structure: reversedStructure() }, expected, check)).toEqual({
      ok: true,
    })
  })

  it('missing-second-table', () => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: actual.tables.filter(table => table.name !== 'owner_parent'),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it('duplicate', () => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: [...actual.tables, ...actual.tables.filter(table => table.name === 'owner_child')],
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it.each<{ name: string; change: Partial<SnapshotColumn> }>([
    { name: 'column-type', change: { type: 'INTEGER' } },
    { name: 'column-notNull', change: { notNull: false } },
    { name: 'column-primaryKeyPosition', change: { primaryKeyPosition: 0 } },
  ])('$name', ({ change }) => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: actual.tables.map(table =>
        table.name === 'owner_child'
          ? {
              ...table,
              columns: table.columns.map(column =>
                column.name === 'id' ? { ...column, ...change } : column,
              ),
            }
          : table,
      ),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it('extra-column', () => {
    const actual = actualStructure()
    const extra: SnapshotColumn = {
      name: 'unexpected',
      type: 'TEXT',
      notNull: false,
      primaryKeyPosition: 0,
    }
    const structure = {
      ...actual,
      tables: actual.tables.map(table =>
        table.name === 'owner_child' ? { ...table, columns: [...table.columns, extra] } : table,
      ),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it.each(['columns', 'indexes', 'foreignKeys'] satisfies (keyof Pick<
    SnapshotTable,
    'columns' | 'indexes' | 'foreignKeys'
  >)[])('remove-%s', key => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: actual.tables.map(table =>
        table.name === 'owner_child' ? { ...table, [key]: table[key].slice(1) } : table,
      ),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it.each<{ name: string; change: Partial<SnapshotIndex> }>([
    { name: 'index-unique', change: { unique: false } },
    { name: 'index-partial', change: { partial: true } },
    { name: 'index-definition', change: { definition: 'CREATE INDEX changed ON owner_child(id)' } },
    { name: 'index-columns', change: { columns: ['id', 'parent_id'] } },
  ])('$name', ({ change }) => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: actual.tables.map(table =>
        table.name === 'owner_child'
          ? {
              ...table,
              indexes: table.indexes.map(index =>
                index.name === 'owner_child_composite' ? { ...index, ...change } : index,
              ),
            }
          : table,
      ),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it.each<{ name: string; change: Partial<SnapshotForeignKey> }>([
    { name: 'foreign-key-table', change: { table: 'other_parent' } },
    { name: 'foreign-key-from', change: { from: ['id'] } },
    { name: 'foreign-key-to', change: { to: ['fallback'] } },
    { name: 'foreign-key-onUpdate', change: { onUpdate: 'CASCADE' } },
    { name: 'foreign-key-onDelete', change: { onDelete: 'CASCADE' } },
  ])('$name', ({ change }) => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: actual.tables.map(table =>
        table.name === 'owner_child'
          ? {
              ...table,
              foreignKeys: table.foreignKeys.map(key =>
                key.from.includes('parent_id') ? { ...key, ...change } : key,
              ),
            }
          : table,
      ),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it('definition', () => {
    const actual = actualStructure()
    const structure = {
      ...actual,
      tables: actual.tables.map(table =>
        table.name === 'owner_child'
          ? { ...table, definition: 'CREATE TABLE owner_child (id INTEGER)' }
          : table,
      ),
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual(failure)
  })

  it('unowned-extra', () => {
    const actual = actualStructure()
    const extra: SnapshotTable = {
      name: 'unowned_extra',
      definition: 'CREATE TABLE unowned_extra (id TEXT)',
      columns: [{ name: 'id', type: 'TEXT', notNull: false, primaryKeyPosition: 0 }],
      indexes: [],
      foreignKeys: [],
    }
    const structure: SnapshotStructure = {
      tables: [...actual.tables, extra],
      views: ['unowned_view'],
      triggers: ['unowned_trigger'],
    }
    expect(checkSnapshotTables({ structure }, expected, check)).toEqual({ ok: true })
  })

  it('frozen-input', () => {
    const structure = reversedStructure()
    const frozenExpected = structuredClone(expected)
    const beforeActual = structuredClone(structure)
    const beforeExpected = structuredClone(frozenExpected)
    freezeStructure(structure)
    freezeStructure(frozenExpected)
    expect(checkSnapshotTables({ structure }, frozenExpected, check)).toEqual({ ok: true })
    expect(structure).toEqual(beforeActual)
    expect(frozenExpected).toEqual(beforeExpected)
  })
})
