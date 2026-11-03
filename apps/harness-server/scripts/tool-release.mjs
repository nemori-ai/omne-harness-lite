// Generate or check the release manifest of the built-in tools (config/tool-release.json) from the
// built @omne-harness/tool-definitions. The composition rules live in
// src/entry/tool-release-manifest.ts, which the startup snapshot uses too; Node strips its types.
// Build tool-definitions (and its dependencies) first. Exit codes: 0 ok, 1 mismatch, 2 error.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_MANIFEST = join(memberDir, 'config', 'tool-release.json')
const ZERO = `sha256:${'0'.repeat(64)}`

/**
 * Construction values used only to derive each author's definition; they are never written to the
 * manifest and are not release defaults. Two different probes must give the same definition,
 * otherwise the definition depends on operator values and the manifest cannot fix it.
 */
const PROBES = [
  {
    Shell: { resultMaxBytes: 1, executable: 'probe', argsPrefix: [], cwd: 'probe', env: {} },
    Files: { resultMaxBytes: 1 },
  },
  {
    Shell: {
      resultMaxBytes: 65536,
      executable: 'other',
      argsPrefix: ['-c'],
      cwd: 'elsewhere',
      env: { A: 'b' },
    },
    Files: { resultMaxBytes: 65536 },
  },
]

function parseArgs(argv) {
  const [command, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) opts[rest[i]] = rest[i + 1]
  const unknown = Object.keys(opts).filter(key => key !== '--manifest')
  if ((command !== 'check' && command !== 'write') || unknown.length > 0)
    throw new Error('usage: tool-release.mjs <check|write> [--manifest <JSON path>]')
  return { command, manifestPath: opts['--manifest'] ?? DEFAULT_MANIFEST }
}

async function compute() {
  const release = await import('../src/entry/tool-release-manifest.ts')
  const root = await release.locateToolDefinitions(memberDir)
  // The same file the startup snapshot imports: the entry under the scanned root.
  const modules = await release.importReleaseModules(root)
  const artifacts = await release.scanArtifacts(root)
  const version = JSON.parse(readFileSync(join(memberDir, 'package.json'), 'utf8')).version
  const tree = value => {
    const read = release.constructionTree(value)
    if (read === undefined) throw new Error('probe construction is not JSON')
    return read
  }
  const draft = release.composeManifest({
    version,
    artifacts,
    modules,
    definitions: Object.fromEntries(release.RELEASE_TOOLS.map(tool => [tool.name, ZERO])),
  })
  const digests = {}
  for (const entry of draft.entries) {
    const module = modules[entry.module.export]
    const governance = release.governanceOf(entry)
    const [first, ...others] = PROBES.map(probe =>
      release.definitionDigest(module, governance, tree(probe[entry.asset.name])),
    )
    if (others.some(digest => digest !== first))
      throw new Error(`the ${entry.asset.name} definition depends on construction values`)
    digests[entry.asset.name] = first
  }
  const manifest = release.composeManifest({ version, artifacts, modules, definitions: digests })
  return { manifest, text: release.manifestText(manifest) }
}

/** Itemised differences between the recomputed manifest and the committed one. */
function diff(expected, committed) {
  const out = []
  if (committed?.generation !== expected.generation) out.push('generation')
  if (JSON.stringify(committed?.artifacts) !== JSON.stringify(expected.artifacts)) {
    const was = new Map((committed?.artifacts?.files ?? []).map(f => [f.path, f.sha256]))
    for (const file of expected.artifacts.files)
      if (was.get(file.path) !== file.sha256) out.push(`artifact ${file.path}`)
    for (const path of was.keys())
      if (!expected.artifacts.files.some(file => file.path === path)) out.push(`-artifact ${path}`)
  }
  for (const entry of expected.entries) {
    const other = (committed?.entries ?? []).find(e => e?.asset?.name === entry.asset.name)
    if (JSON.stringify(other) !== JSON.stringify(entry)) out.push(`entry ${entry.asset.name}`)
  }
  if (JSON.stringify(committed?.consumer) !== JSON.stringify(expected.consumer))
    out.push('consumer')
  return out
}

async function main(argv) {
  const { command, manifestPath } = parseArgs(argv)
  const { manifest, text } = await compute()
  if (command === 'write') {
    writeFileSync(manifestPath, text)
    return 0
  }
  const committed = readFileSync(manifestPath, 'utf8')
  if (committed === text) {
    console.log(
      `tool-release: ok entries=${manifest.entries.length} artifacts=${manifest.artifacts.files.length} generation=${manifest.generation}`,
    )
    return 0
  }
  let items
  try {
    items = diff(manifest, JSON.parse(committed))
  } catch {
    items = ['bytes manifest is not valid JSON']
  }
  if (items.length === 0) items = ['bytes manifest differs only in formatting']
  console.error(['tool-release: mismatch', ...items].join('\n'))
  return 1
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(`tool-release: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
}
