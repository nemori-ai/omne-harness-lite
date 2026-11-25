import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { toolAssetPublication } from '../../../src/rows/governance/tool-assets.ts'

/** The production release plus `extra` made-up tools, each a renamed copy of one small real tool,
 * and a release participant that provides exactly that. */
export async function crowdedRelease(extra: number) {
  const loaded = await loadProductionRelease()
  if (loaded.kind !== 'trusted') throw new Error('No release for fixture')
  const manifest = structuredClone(loaded.manifest)
  const model = manifest.entries.find(entry => entry.asset.name === 'TodoItems')
  if (model === undefined) throw new Error('No model tool for fixture')
  for (let index = 0; index < extra; index += 1) {
    const name = `Madeup${String(index).padStart(2, '0')}`
    const entry = JSON.parse(JSON.stringify(model).replaceAll('TodoItems', name)) as typeof model
    const declaration = entry.governance.declaration
    const { digest: _digest, ...reference } = declaration.reference
    declaration.reference.digest = canonicalDigest({ ...declaration, reference }).slice(7)
    manifest.entries.push(entry)
  }
  const release = { ...loaded, manifest, generation: canonicalDigest(manifest) }
  const publications = manifest.entries.map(entry => ({
    publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
    declaration: entry.governance.declaration,
  }))
  const interpretations = manifest.entries.flatMap(entry => entry.governance.interpretations)
  const protocol = `fixture-crowded-release/1/${release.generation}`
  const source = `export default { participant: 'harness.tool-permission-release', protocol: ${JSON.stringify(protocol)}, execute(_facts, port) {
    port.provideFact({key:'harness.permission-releases',protocol:'1'}, ${JSON.stringify(interpretations)});
    port.provideFact({key:'harness.governance-publications',protocol:'1'}, ${JSON.stringify(publications)});
    return {kind:'participated',response:null};
  } }`
  const root = await realpath(await mkdtemp(join(tmpdir(), 'crowded-release-')))
  const file = join(root, 'release.mjs')
  await writeFile(file, source)
  const releaseParticipant: SqlMaterialCatalog['participants'][number] = {
    participant: 'harness.tool-permission-release',
    protocol,
    moduleUrl: pathToFileURL(file).href,
    codeDigest: createHash('sha256').update(source).digest('hex'),
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    requiresFacts: [],
    grouping: 'groupable',
    providesFacts: [
      { key: 'harness.permission-releases', protocol: '1' },
      { key: 'harness.governance-publications', protocol: '1' },
    ],
  }
  return { release, releaseParticipant, remove: () => rm(root, { recursive: true, force: true }) }
}
