import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'

export function filesUnder(root: string, wanted: (name: string) => boolean): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (wanted(entry.name)) found.push(path)
    }
  }
  walk(root)
  return found
}

/** Every value every table of the storage holds, as text: packed text unpacked, other bytes as they are. */
export function storedTexts(storageRoot: string): string[] {
  const texts: string[] = []
  for (const file of filesUnder(storageRoot, name => /\.(sqlite|db)$/u.test(name))) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      for (const { name } of tables)
        for (const row of db.prepare(`SELECT * FROM "${String(name)}"`).all())
          for (const value of Object.values(row)) {
            if (typeof value === 'string') texts.push(value)
            if (!(value instanceof Uint8Array)) continue
            texts.push(Buffer.from(value).toString('latin1'))
            try {
              texts.push(unpackText(value))
            } catch {
              // Not packed text: the bytes themselves were looked at above.
            }
          }
    } finally {
      db.close()
    }
  }
  return texts
}
