// Construction checks of the static materials (SPEC 4.1, 4.2, 5.3). The factory reads the module
// files once and compares their digests. It opens no database and starts no Worker.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { combinationManifest, type SqlMaterialCatalog } from '@omne-harness/sql-contract'

async function digestOfFile(moduleUrl: string): Promise<string | null> {
  try {
    const url = new URL(moduleUrl)
    if (url.protocol !== 'file:') return null
    return createHash('sha256')
      .update(await readFile(fileURLToPath(url)))
      .digest('hex')
  } catch {
    return null
  }
}

export type MaterialJudgement = Readonly<{
  materialProblems: readonly string[]
  declaredProblems: readonly string[]
}>

export async function checkMaterials(catalog: SqlMaterialCatalog): Promise<MaterialJudgement> {
  const materialProblems: string[] = []
  const files: [string, string, string][] = [
    ...catalog.participants.map((item): [string, string, string] => [
      `participant ${item.participant}`,
      item.moduleUrl,
      item.codeDigest,
    ]),
    ...catalog.migrations.map((item): [string, string, string] => [
      `migration ${item.owner}/${item.id}`,
      item.moduleUrl,
      item.checksum,
    ]),
    ...catalog.readHandlers.map((item): [string, string, string] => [
      `handler ${item.handler}`,
      item.moduleUrl,
      item.codeDigest,
    ]),
  ]
  for (const [material, moduleUrl, expected] of files) {
    const actual = await digestOfFile(moduleUrl)
    if (actual === null) materialProblems.push(`material_unreadable: ${material}`)
    else if (actual !== expected) materialProblems.push(`material_digest_mismatch: ${material}`)
  }
  for (const item of catalog.participants)
    if (item.grouping !== 'groupable' && item.grouping !== 'singleton')
      materialProblems.push(`grouping_undeclared: participant ${item.participant}`)
  const declaredProblems: string[] = []
  for (const [kind, declared] of Object.entries(catalog.declaredCombinations)) {
    if (declared === null) continue
    const judged = combinationManifest({ catalog, participants: declared.participants })
    if (judged.kind !== 'manifest') declaredProblems.push(`declared_combination_invalid: ${kind}`)
  }
  return { materialProblems, declaredProblems }
}
