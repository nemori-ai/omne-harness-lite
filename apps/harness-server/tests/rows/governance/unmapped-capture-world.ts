import { createHash } from 'node:crypto'
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalDigest } from '@omne-harness/tool'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { toolAssetPublication } from '../../../src/rows/governance/tool-assets.ts'
import { governanceAdoptionWorld } from './governance-adoption-world.ts'

/** A fixed trusted-release boundary fixture; all holdings, adoption and permission facts use real SQL owners. */
export async function unmappedCaptureWorld(
  options: Parameters<typeof governanceAdoptionWorld>[0],
  initialize = true,
) {
  const loaded = await loadProductionRelease()
  if (loaded.kind !== 'trusted') throw new Error('No release for fixture')
  const manifest = structuredClone(loaded.manifest)
  manifest.entries = manifest.entries.filter(entry => entry.asset.name === 'Shell')
  for (const entry of manifest.entries) {
    const declaration = entry.governance.declaration
    declaration.settings = []
    for (const permission of declaration.permissions) {
      permission.settings = null
      permission.defaultRule = { pick: 'auto', allowedSet: null }
      permission.assignmentLayers = ['session']
    }
    for (const interpretation of entry.governance.interpretations) {
      const permission = declaration.permissions.find(
        value => value.enforcementKey === interpretation.definition.enforcementKey,
      )
      if (permission === undefined) throw new Error('Missing fixture permission')
      interpretation.definition = structuredClone(permission)
    }
    const { digest: _digest, ...reference } = declaration.reference
    declaration.reference.digest = canonicalDigest({ ...declaration, reference }).slice(7)
  }
  const release = { ...loaded, manifest, generation: canonicalDigest(manifest) }
  const publications = manifest.entries.map(entry => ({
    publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
    declaration: entry.governance.declaration,
  }))
  const interpretations = manifest.entries.flatMap(entry => entry.governance.interpretations)
  const protocol = `fixture-unmapped-release/1/${release.generation}`
  const source = `export default { participant: 'harness.tool-permission-release', protocol: ${JSON.stringify(protocol)}, execute(_facts, port) {
    port.provideFact({key:'harness.permission-releases',protocol:'1'}, ${JSON.stringify(interpretations)});
    port.provideFact({key:'harness.governance-publications',protocol:'1'}, ${JSON.stringify(publications)});
    return {kind:'participated',response:null};
  } }`
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unmapped-permission-release-')))
  const file = join(root, 'release.mjs')
  await writeFile(file, source)
  try {
    const w = await governanceAdoptionWorld({
      ...options,
      release,
      releaseParticipant: {
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
      },
    })
    if (initialize) {
      await w.setup()
      const registered = await w.service.contribute(w.access, {
        scope: w.scope,
        contributorId: 'tools',
        generation: '1',
        operationId: 'unmapped-register',
        declaration: w.declaration,
      })
      if (registered.kind !== 'registered') {
        await w.close()
        throw new Error(JSON.stringify(registered))
      }
    }
    return {
      ...w,
      async close() {
        await w.close()
        await rm(root, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}
