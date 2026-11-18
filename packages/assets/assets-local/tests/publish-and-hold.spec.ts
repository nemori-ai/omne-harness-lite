import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import migration from '../src/migration.ts'
import { mutate } from '../src/mutations.ts'
import { readHolding, readVersion, selectedVersion } from '../src/records.ts'
import { mutationSchema, type Mutation } from '../src/schema.ts'

const databases: DatabaseSync[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

const domain = {
  scope: { kind: 'tenant', tenant: 'tenant-a' },
  transactionDomain: 'assets.test',
} as const
const REF = 'note/a'

function open() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  const port = {
    execute(sql: string, params: readonly unknown[]) {
      const statement = db.prepare(sql)
      const columns = statement.columns().map(column => column.name)
      if (columns.length)
        return {
          columns,
          rows: statement
            .all(...(params as never[]))
            .map(row => columns.map(column => row[column] ?? null)),
          changes: 0n,
          lastInsertRowid: null,
        }
      const result = statement.run(...(params as never[]))
      return {
        columns,
        rows: [],
        changes: BigInt(result.changes),
        lastInsertRowid: BigInt(result.lastInsertRowid),
      }
    },
  } as unknown as ParticipantPort
  migration.up(port)
  return port
}

function publishAndHold(
  operationId: string,
  version: string,
  overrides: Partial<Record<'scopeRef' | 'holdingRef', string>> = {},
): Mutation {
  return mutationSchema.parse({
    kind: 'publishAndHold',
    operationId,
    assetRef: REF,
    expectedRevision: 0,
    category: 'note',
    name: 'a',
    version,
    source: 'test',
    body: { kind: 'string', value: version },
    declaration: { kind: 'none' },
    holding: {
      holdingRef: overrides.holdingRef ?? REF,
      scopeRef: overrides.scopeRef ?? 'tenant-a',
      sources: [
        { sourceId: 'tenant', ownerRef: 'test', scope: { kind: 'tenant', subjectRef: 'tenant-a' } },
      ],
      grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
    },
  })
}

function at(revision: number, command: Mutation): Mutation {
  return { ...command, expectedRevision: revision } as Mutation
}

function run(port: ParticipantPort, command: Mutation) {
  return mutate(port, { domain, command })
}

const held = (port: ParticipantPort, holdingRef = REF) => readHolding(port, domain, holdingRef)
const selected = (port: ParticipantPort) => {
  const holding = held(port)
  return holding === null ? null : (selectedVersion(port, holding)?.version.version ?? null)
}

describe('publishAndHold: the version and the holding in one participant call', () => {
  it('持有不在：写版本，新建持有并跟随', () => {
    const port = open()
    expect(run(port, publishAndHold('p1', 'v1'))).toEqual({
      kind: 'committed',
      operationId: 'p1',
      revision: 1,
      changed: true,
    })
    expect(held(port)).toMatchObject({
      holdingRef: REF,
      state: 'held',
      selection: { kind: 'follow' },
      revision: 1,
    })
    expect(selected(port)).toBe('v1')
  })

  it('在且跟随：只写版本，持有不动；同一版本再来不写，changed 是 false', () => {
    const port = open()
    run(port, publishAndHold('p1', 'v1'))
    expect(run(port, at(1, publishAndHold('p2', 'v2')))).toMatchObject({
      kind: 'committed',
      revision: 2,
      changed: true,
    })
    expect(held(port)).toMatchObject({ selection: { kind: 'follow' }, revision: 1 })
    expect(selected(port)).toBe('v2')
    expect(run(port, at(2, publishAndHold('p3', 'v2')))).toEqual({
      kind: 'committed',
      operationId: 'p3',
      revision: 2,
      changed: false,
    })
  })

  it('在且固定在旧版：改成固定在新版', () => {
    const port = open()
    run(port, publishAndHold('p1', 'v1'))
    expect(
      run(
        port,
        mutationSchema.parse({
          kind: 'changeHolding',
          operationId: 'pin',
          holdingRef: REF,
          scopeRef: 'tenant-a',
          expectedRevision: 1,
          change: { kind: 'selectVersion', selection: { kind: 'pinned', version: 'v1' } },
        }),
      ),
    ).toMatchObject({ kind: 'committed' })
    expect(run(port, at(1, publishAndHold('p2', 'v2')))).toMatchObject({
      kind: 'committed',
      changed: true,
    })
    expect(held(port)).toMatchObject({
      selection: { kind: 'pinned', version: 'v2' },
      revision: 3,
    })
  })

  it('跟随而最新版不是这一版（旧内容再发）：固定到这一版', () => {
    const port = open()
    run(port, publishAndHold('p1', 'v1'))
    run(port, at(1, publishAndHold('p2', 'v2')))
    expect(run(port, at(2, publishAndHold('p3', 'v1')))).toMatchObject({
      kind: 'committed',
      revision: 2,
      changed: true,
    })
    expect(held(port)).toMatchObject({ selection: { kind: 'pinned', version: 'v1' } })
  })

  it('已移除：答 holding_removed', () => {
    const port = open()
    run(port, publishAndHold('p1', 'v1'))
    run(
      port,
      mutationSchema.parse({
        kind: 'changeHolding',
        operationId: 'remove',
        holdingRef: REF,
        scopeRef: 'tenant-a',
        expectedRevision: 1,
        change: { kind: 'remove' },
      }),
    )
    expect(run(port, at(1, publishAndHold('p2', 'v2')))).toEqual({
      kind: 'rejected',
      reason: 'holding_removed',
    })
  })

  it('持有引用指向别的资产：答 holding_exists', () => {
    const port = open()
    run(port, publishAndHold('p1', 'v1'))
    const other = mutationSchema.parse({
      ...publishAndHold('p2', 'v9'),
      assetRef: 'note/other',
      name: 'other',
    })
    expect(run(port, other)).toEqual({ kind: 'rejected', reason: 'holding_exists' })
  })

  it('持有的范围不是这个租户：答 forbidden，什么都不写', () => {
    const port = open()
    expect(run(port, publishAndHold('p1', 'v1', { scopeRef: 'tenant-b' }))).toEqual({
      kind: 'rejected',
      reason: 'forbidden',
    })
    expect(readVersion(port, domain, REF, 'v1')).toBeNull()
  })

  it('单独的发布与持有两种变更照旧各写自己的行', () => {
    const port = open()
    const { holding: _holding, ...fields } = publishAndHold('p1', 'v1') as Extract<
      Mutation,
      { kind: 'publishAndHold' }
    >
    const published = run(port, mutationSchema.parse({ ...fields, kind: 'publish' }))
    expect(published).toEqual({ kind: 'committed', operationId: 'p1', revision: 1, changed: true })
    expect(held(port)).toBeNull()
    expect(
      run(
        port,
        mutationSchema.parse({
          kind: 'hold',
          operationId: 'h1',
          holdingRef: REF,
          scopeRef: 'tenant-a',
          assetRef: REF,
          selection: { kind: 'follow' },
          sources: [
            {
              sourceId: 'tenant',
              ownerRef: 'test',
              scope: { kind: 'tenant', subjectRef: 'tenant-a' },
            },
          ],
          grants: [],
        }),
      ),
    ).toEqual({ kind: 'committed', operationId: 'h1', revision: 1, changed: true })
    expect(selected(port)).toBe('v1')
  })

  it('发布这一步被拒（修订对不上）：不碰持有', () => {
    const port = open()
    run(port, publishAndHold('p1', 'v1'))
    expect(run(port, publishAndHold('p2', 'v2'))).toEqual({
      kind: 'rejected',
      reason: 'revision_conflict',
    })
    expect(selected(port)).toBe('v1')
  })
})
