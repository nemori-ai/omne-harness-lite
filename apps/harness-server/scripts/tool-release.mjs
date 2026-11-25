import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_MANIFEST = join(memberDir, 'config', 'tool-release.json')
const ZERO = `sha256:${'0'.repeat(64)}`

const PROBES = [
  {
    Shell: { resultMaxBytes: 1, executable: 'probe', argsPrefix: [], env: {} },
    Files: {
      resultMaxBytes: 1,
      openMaxBytes: 1,
      imageMaxWidth: 1,
      imageMaxHeight: 1,
      imageMaxDecodedBytes: 1,
      imageConcurrency: 1,
    },
    Tools: { resultMaxBytes: 4096, outputModalities: ['text'] },
    TodoItems: { resultMaxBytes: 4096 },
    BkgToolCalls: { resultMaxBytes: 4096 },
    Ask: { resultMaxBytes: 4096 },
    Web: { resultMaxBytes: 1, maxSearchResults: 1 },
    Skills: { resultMaxBytes: 4096 },
    Calendar: { resultMaxBytes: 16 },
    Schedules: { resultMaxBytes: 64 },
    Jobs: { resultMaxBytes: 64 },
    Notifications: { resultMaxBytes: 64 },
    Canvas: { resultMaxBytes: 64 },
    Sessions: { resultMaxBytes: 1024 },
    Agents: { resultMaxBytes: 64 },
    SwitchWorkspace: { resultMaxBytes: 16 },
    OmneExtensions: { resultMaxBytes: 64 },
    OmneExtensionPoints: { resultMaxBytes: 64 },
    Screen: {
      resultMaxBytes: 1,
      captureMaxLongSide: 1,
      imageMaxWidth: 1,
      imageMaxHeight: 1,
      imageMaxDecodedBytes: 1,
      imageConcurrency: 1,
    },
    Code: {
      resultMaxBytes: 1,
      computeMs: 1,
      memoryBytes: 1,
      outputBytes: 1,
      calls: 1,
      callsInFlight: 1,
      sourceBytes: 1,
    },
  },
  {
    Shell: {
      resultMaxBytes: 65536,
      executable: 'other',
      argsPrefix: ['-c'],
      env: { A: 'b' },
    },
    Files: {
      resultMaxBytes: 65536,
      openMaxBytes: 1048576,
      imageMaxWidth: 4096,
      imageMaxHeight: 4096,
      imageMaxDecodedBytes: 67108864,
      imageConcurrency: 4,
    },
    Tools: { resultMaxBytes: 65536, outputModalities: ['text'] },
    TodoItems: { resultMaxBytes: 1048576 },
    BkgToolCalls: { resultMaxBytes: 1048576 },
    Ask: { resultMaxBytes: 1048576 },
    Web: { resultMaxBytes: 65536, maxSearchResults: 10 },
    Skills: { resultMaxBytes: 1048576 },
    Calendar: { resultMaxBytes: 1048576 },
    Schedules: { resultMaxBytes: 1048576 },
    Jobs: { resultMaxBytes: 1048576 },
    Notifications: { resultMaxBytes: 1048576 },
    Canvas: { resultMaxBytes: 1048576 },
    Sessions: { resultMaxBytes: 1048576 },
    Agents: { resultMaxBytes: 1048576 },
    SwitchWorkspace: { resultMaxBytes: 1048576 },
    OmneExtensions: { resultMaxBytes: 1048576 },
    OmneExtensionPoints: { resultMaxBytes: 1048576 },
    Screen: {
      resultMaxBytes: 65536,
      captureMaxLongSide: 2048,
      imageMaxWidth: 4096,
      imageMaxHeight: 4096,
      imageMaxDecodedBytes: 67108864,
      imageConcurrency: 4,
    },
    Code: {
      resultMaxBytes: 65536,
      computeMs: 30000,
      memoryBytes: 67108864,
      outputBytes: 1048576,
      calls: 200,
      callsInFlight: 8,
      sourceBytes: 65536,
    },
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
  const roots = await release.locateReleasePackages(memberDir)
  const modules = await release.importReleaseModules(roots)
  const artifacts = await release.scanArtifacts(roots)
  const version = JSON.parse(readFileSync(join(memberDir, 'package.json'), 'utf8')).version
  const tree = value => {
    const read = release.constructionTree(value)
    if (read === undefined) throw new Error('probe construction is not JSON')
    return read
  }
  // The draft only fixes each asset's adoption; its definitions are placeholders.
  const placeholder = {
    digest: ZERO,
    gates: [{ id: 'invoke', title: '调用', default: 'ask', commands: [] }],
  }
  const draft = release.composeManifest({
    version,
    artifacts,
    modules,
    definitions: Object.fromEntries(release.RELEASE_TOOLS.map(tool => [tool.name, placeholder])),
  })
  const definitions = {}
  for (const entry of draft.entries) {
    const module = modules[entry.module.export]
    const governance = release.governanceOf(entry)
    const [first, ...others] = PROBES.map(probe =>
      release.releasedDefinition(module, governance, tree(probe[entry.asset.name])),
    )
    if (others.some(other => JSON.stringify(other) !== JSON.stringify(first)))
      throw new Error(`the ${entry.asset.name} definition depends on construction values`)
    definitions[entry.asset.name] = first
  }
  const manifest = release.composeManifest({ version, artifacts, modules, definitions })
  return { manifest, text: release.manifestText(manifest) }
}

function diff(expected, committed) {
  const out = []
  if (committed?.generation !== expected.generation) out.push('generation')
  if (JSON.stringify(committed?.artifacts) !== JSON.stringify(expected.artifacts)) {
    const files = artifacts =>
      (Array.isArray(artifacts) ? artifacts : []).flatMap(own =>
        (own?.files ?? []).map(f => [`${own.package}/${f.path}`, f.sha256]),
      )
    const was = new Map(files(committed?.artifacts))
    const now = files(expected.artifacts)
    for (const [path, sha] of now) if (was.get(path) !== sha) out.push(`artifact ${path}`)
    for (const path of was.keys())
      if (!now.some(([other]) => other === path)) out.push(`-artifact ${path}`)
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
      `tool-release: ok entries=${manifest.entries.length} artifacts=${manifest.artifacts.reduce((n, own) => n + own.files.length, 0)} generation=${manifest.generation}`,
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
