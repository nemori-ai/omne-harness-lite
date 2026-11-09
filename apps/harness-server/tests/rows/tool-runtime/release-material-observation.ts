import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { canonicalDigest, type LedgerRecord } from '@omne-harness/tool'

/** Read-only physical evidence from the isolated test database. Never drives model reads. */
export function observeToolMaterials(storageRoot: string) {
  const directory = join(storageRoot, 'domains')
  const found = []
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sqlite'))) {
    const db = new DatabaseSync(join(directory, name), { readOnly: true })
    try {
      if (!db.prepare("SELECT name FROM sqlite_schema WHERE name='tl_material'").get()) continue
      const records = db
        .prepare('SELECT record FROM tl_record')
        .all()
        .map(row => JSON.parse(String(row['record'])) as LedgerRecord)
      const results = records.filter(record => record.kind === 'result')
      const chunks = new Map(
        db
          .prepare(
            'SELECT material, count(*) AS count, sum(length(data)) AS bytes FROM tl_material_chunk GROUP BY material',
          )
          .all()
          .map(row => [
            canonicalDigest(JSON.parse(String(row['material']))),
            { count: Number(row['count']), bytes: Number(row['bytes']) },
          ]),
      )
      const physical = new Map(
        db
          .prepare('SELECT material,state FROM tl_material')
          .all()
          .map(row => [canonicalDigest(JSON.parse(String(row['material']))), String(row['state'])]),
      )
      const materials: {
        purpose: string
        state: string
        physicalState: string
        bytes: number
        chunks: number
      }[] = []
      found.push({
        results: results.map(record => ({
          delivery: record.result.delivery.kind,
          original: record.result.value.original.kind,
        })),
        materials,
        cleanup: 0,
        uses: [] as string[],
      })
    } finally {
      db.close()
    }
  }
  if (found.length !== 1 || found[0] === undefined) throw new Error('expected one Tool database')
  return found[0]
}

export function inlineResultReleased(value: ReturnType<typeof observeToolMaterials>) {
  const copies = value.materials
  return (
    value.results.length === 1 &&
    value.results.every(result => result.delivery === 'released' && result.original === 'none') &&
    copies.length > 0 &&
    copies.every(
      material =>
        material.state === 'deleted' &&
        material.physicalState === 'deleted' &&
        material.bytes === 0 &&
        material.chunks === 0,
    ) &&
    value.cleanup === 0 &&
    value.uses.length === 0
  )
}
