// The adoption fingerprints of a family: a committed file with one `{name, revision, digest}` line
// per record. The check compares both ways; the generator only appends lines for new records.
import { readFile, writeFile } from 'node:fs/promises'
import { familyRecords, type PiFamily } from '../family-table.ts'

/** One line of the fingerprint file. */
export type AdoptionFingerprint = Readonly<{ name: string; revision: string; digest: string }>

export type FingerprintReport = Readonly<{ problems: readonly string[] }>

const FIELDS = ['digest', 'name', 'revision'] as const

/**
 * The text of a fingerprint file: a JSON array with one fingerprint per line, in the given order,
 * members in the order `name`, `revision`, `digest`, and a final line break.
 */
export function renderFingerprints(lines: readonly AdoptionFingerprint[]): string {
  if (lines.length === 0) return '[]\n'
  const items = lines.map(line =>
    JSON.stringify({ name: line.name, revision: line.revision, digest: line.digest }),
  )
  return `[\n  ${items.join(',\n  ')}\n]\n`
}

type Parsed = Readonly<{ lines: readonly AdoptionFingerprint[] }> | Readonly<{ problem: string }>

function parseFingerprints(text: string): Parsed {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { problem: 'the fingerprint file is not JSON' }
  }
  if (!Array.isArray(value)) return { problem: 'the fingerprint file is not an array' }
  const lines: AdoptionFingerprint[] = []
  for (const [index, item] of value.entries()) {
    const line = fingerprintOf(item)
    if (line === null)
      return { problem: `line ${index + 1} is not exactly {name, revision, digest} strings` }
    lines.push(line)
  }
  if (renderFingerprints(lines) !== text)
    return { problem: 'the fingerprint file is not in its rendered form (see renderFingerprints)' }
  return { lines }
}

function fingerprintOf(item: unknown): AdoptionFingerprint | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
  const keys = Object.keys(item).toSorted()
  if (keys.length !== FIELDS.length || keys.some((key, index) => key !== FIELDS[index])) return null
  const name: unknown = Reflect.get(item, 'name')
  const revision: unknown = Reflect.get(item, 'revision')
  const digest: unknown = Reflect.get(item, 'digest')
  if (typeof name !== 'string' || typeof revision !== 'string' || typeof digest !== 'string')
    return null
  return { name, revision, digest }
}

function keyOf(line: Readonly<{ name: string; revision: string }>): string {
  return JSON.stringify([line.name, line.revision])
}

function fingerprintsOf(family: PiFamily): readonly AdoptionFingerprint[] {
  return familyRecords(family).map(({ adoption }) => ({
    name: adoption.name,
    revision: adoption.revision,
    digest: adoption.digest,
  }))
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * Compares the fingerprint file with the records of the family, both ways. Reports a missing or
 * malformed file, a repeated line, a record without a line, a line whose digest differs from the
 * digest of its record, and a line that names no record.
 */
export async function checkAdoptionFingerprints(
  family: PiFamily,
  file: string,
): Promise<FingerprintReport> {
  const text = await readText(file)
  if (text === null) return { problems: [`missing fingerprint file ${file}`] }
  const parsed = parseFingerprints(text)
  if ('problem' in parsed) return { problems: [parsed.problem] }
  const problems: string[] = []
  const lines = new Map<string, AdoptionFingerprint>()
  for (const line of parsed.lines) {
    if (lines.has(keyOf(line))) problems.push(`${line.name}/${line.revision}: repeated line`)
    lines.set(keyOf(line), line)
  }
  const records = new Set<string>()
  for (const fingerprint of fingerprintsOf(family)) {
    const label = `${fingerprint.name}/${fingerprint.revision}`
    records.add(keyOf(fingerprint))
    const line = lines.get(keyOf(fingerprint))
    if (line === undefined) problems.push(`${label}: no fingerprint line`)
    else if (line.digest !== fingerprint.digest)
      problems.push(
        `${label}: the record digest ${fingerprint.digest} differs from the line ${line.digest}`,
      )
  }
  for (const line of parsed.lines)
    if (!records.has(keyOf(line)))
      problems.push(`${line.name}/${line.revision}: the line names no record`)
  return Object.freeze({ problems: Object.freeze(problems) })
}

/**
 * Appends a line for every record that has none, after the existing lines, and writes the file;
 * a missing file starts empty. Throws `RangeError` and writes nothing when the file is malformed
 * or a record has a line with another digest: a changed record needs a new revision, never a
 * changed line. Lines that name no record stay; the check reports them. Returns the added lines.
 */
export async function appendAdoptionFingerprints(
  family: PiFamily,
  file: string,
): Promise<readonly AdoptionFingerprint[]> {
  const text = await readText(file)
  const parsed = parseFingerprints(text ?? renderFingerprints([]))
  if ('problem' in parsed) throw new RangeError(`${file}: ${parsed.problem}`)
  const lines = new Map(parsed.lines.map(line => [keyOf(line), line]))
  const added: AdoptionFingerprint[] = []
  for (const fingerprint of fingerprintsOf(family)) {
    const line = lines.get(keyOf(fingerprint))
    if (line === undefined) {
      added.push(fingerprint)
      lines.set(keyOf(fingerprint), fingerprint)
    } else if (line.digest !== fingerprint.digest)
      throw new RangeError(
        `${file}: ${fingerprint.name}/${fingerprint.revision} would change its digest; add a new revision instead`,
      )
  }
  if (added.length > 0 || text === null)
    await writeFile(file, renderFingerprints([...parsed.lines, ...added]))
  return Object.freeze(added)
}
