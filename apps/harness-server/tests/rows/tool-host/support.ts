import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Message } from '@deepseek-ai/cordis'
import type { JsonValue } from '@omne-harness/json-text'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { succeed } from '@omne-harness/operation-result'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import {
  ToolResidencyReaderService,
  toolContributionAuthorityKey,
  type ToolContributionAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import { principalIssuer, principalVerifier } from '../../../src/entry/principals.ts'
import {
  TOOL_RELEASE_REGISTRANT_KEY,
  createToolReleaseEntries,
  loadProductionRelease,
  productionReleaseInput,
  type ToolReleaseRegistrant,
} from '../../../src/entry/tool-release.ts'
import {
  constructionTree,
  locateToolDefinitions,
  loadToolRelease,
  type ToolReleaseManifest,
  type ToolReleaseSnapshot,
} from '../../../src/entry/tool-release-manifest.ts'
import { toolResidencyPrincipal } from '../../../src/entry/tool-residency-principal.ts'
import { fixtureEnv, got, type FixtureEnv } from '../../entry/support.ts'

const MEMBER = fileURLToPath(new URL('../../../', import.meta.url))
export const MANIFEST_PATH = join(MEMBER, 'config', 'tool-release.json')

export function formalManifest(): ToolReleaseManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ToolReleaseManifest
}

export function authorityOf(manifest: ToolReleaseManifest, name: string): ToolAuthority {
  const entry = manifest.entries.find(candidate => candidate.asset.name === name)
  if (entry === undefined) throw new Error(`fixture: no release entry ${name}`)
  return {
    layer: { kind: 'official' },
    asset: structuredClone(entry.asset),
    holding: structuredClone(entry.holding),
    publication: structuredClone(entry.publication),
  }
}

export function entryOf(manifest: ToolReleaseManifest, name: string) {
  const entry = manifest.entries.find(candidate => candidate.asset.name === name)
  if (entry === undefined) throw new Error(`fixture: no release entry ${name}`)
  return entry
}

export const TEST_CONSTRUCTION = Object.freeze({
  Shell: {
    resultMaxBytes: 4096,
    executable: process.execPath,
    argsPrefix: [],
    cwd: MEMBER,
    env: {},
  },
  Files: { resultMaxBytes: 4096 },
  Tools: { resultMaxBytes: 4096, outputModalities: ['text'] },
  TodoItems: { resultMaxBytes: 1_048_576 },
  Ask: { resultMaxBytes: 1_048_576 },
  Web: { resultMaxBytes: 4096, maxSearchResults: 10 },
})

export function tree(value: unknown): JsonValue {
  const read = constructionTree(value)
  if (read === undefined) throw new Error('fixture: not JSON')
  return read
}

// 清理时先单独删掉副本的 `node_modules` 这个链接本身、确认它已不在，再删副本；
// 递归进链接目标会删掉原包真实的依赖目录。
export async function packageCopy(tamper: boolean): Promise<{ root: string; remove(): void }> {
  const source = await locateToolDefinitions(MEMBER)
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tool-release-copy-')))
  cpSync(join(source, 'package.json'), join(root, 'package.json'))
  cpSync(join(source, 'dist'), join(root, 'dist'), { recursive: true })
  const link = join(root, 'node_modules')
  symlinkSync(join(source, 'node_modules'), link, 'junction')
  if (tamper) {
    const file = join(root, 'dist', 'index.js')
    const bytes = readFileSync(file)
    bytes[0] = (bytes[0] ?? 0) ^ 0x01
    writeFileSync(file, bytes)
  }
  return {
    root,
    remove: () => {
      if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link)
      if (existsSync(link))
        throw new Error(`fixture: ${link} is still present; not removing ${root}`)
      rmSync(root, { recursive: true, force: true })
    },
  }
}

export const releaseFrom = (packageRoot: string) => (): Promise<ToolReleaseSnapshot> =>
  loadToolRelease({ ...productionReleaseInput(), packageRoot: async () => packageRoot })

class EmptyResidency extends ToolResidencyReaderService {
  readonly referencing: ToolResidencyReaderService['referencing'] = async () =>
    succeed({ items: [], next: null })
}

export type ReleaseFixture = FixtureEnv &
  Readonly<{
    authority: ToolContributionAuthority<unknown>
    registrant: ToolReleaseRegistrant
    manifest: ToolReleaseManifest
    logs: Message[]
  }>

export async function releaseFixture(
  load: () => Promise<ToolReleaseSnapshot> = loadProductionRelease,
  options?: Parameters<typeof createToolReleaseEntries>[1],
): Promise<ReleaseFixture> {
  const fixture = fixtureEnv([principalIssuerKey])
  const logs: Message[] = []
  fixture.root.logger.exporter({ levels: { default: 3 }, export: message => logs.push(message) })
  const entries = createToolReleaseEntries(load, options)
  await fixture.install(principalVerifier)
  await fixture.install(principalIssuer)
  await fixture.install(toolResidencyPrincipal)
  await fixture.install(entries.registrant)
  await fixture.install(entries.authority)
  await fixture.root.plugin({
    name: 'fixture-residency',
    apply: (ctx: Context) => {
      new EmptyResidency(ctx)
    },
  })
  const authority = got(
    fixture.root.get(toolContributionAuthorityKey),
    'toolContributionAuthority',
  ) as ToolContributionAuthority<unknown>
  const registrant = got(
    fixture.root.get(TOOL_RELEASE_REGISTRANT_KEY),
    'toolReleaseRegistrant',
  ) as ToolReleaseRegistrant
  return { ...fixture, authority, registrant, manifest: formalManifest(), logs }
}
