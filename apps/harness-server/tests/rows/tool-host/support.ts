// 发行内置 Tool 用例的共用夹具：真实入口对象（核验器、签发者、两个系统主体、发行登记者与来源权威）装在
// 一个根上下文上，清单取自正式 `config/tool-release.json`。用例只经服务键、模块 `install` 与公开导出调用。
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

/** 清单里某个作者的完整来源（四个字段）。 */
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

/** 运维者层的测试构造值：本组用例不执行作者，值只满足两个作者的构造字段。 */
export const TEST_CONSTRUCTION = Object.freeze({
  Shell: {
    resultMaxBytes: 4096,
    executable: process.execPath,
    argsPrefix: [],
    cwd: MEMBER,
    env: {},
  },
  Files: { resultMaxBytes: 4096 },
})

export function tree(value: unknown): JsonValue {
  const read = constructionTree(value)
  if (read === undefined) throw new Error('fixture: not JSON')
  return read
}

/**
 * 已安装 tool-definitions 的副本（`package.json` 与 `dist`），可选地翻转 `dist/index.js` 的一个字节。副本的
 * `node_modules` 是指向原包依赖目录的链接（Windows 上是目录联接），所以从副本 import 能解析它的依赖。
 * 清理时先单独删掉这个链接本身，确认它已不在，再删副本；不递归进链接目标。
 */
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

/** 换掉包根的生产读法：模块仍从已安装的包导入，只有产物摘要按副本重算。 */
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
    /** Cordis 日志：本根上的全部级别（含默认不导出的 warn 与 debug）。 */
    logs: Message[]
  }>

/** 在一个根上装好入口对象与一个空常驻引用读取器。`load` 默认是生产读法。 */
export async function releaseFixture(
  load: () => Promise<ToolReleaseSnapshot> = loadProductionRelease,
): Promise<ReleaseFixture> {
  const fixture = fixtureEnv([principalIssuerKey])
  const logs: Message[] = []
  fixture.root.logger.exporter({ levels: { default: 3 }, export: message => logs.push(message) })
  const entries = createToolReleaseEntries(load)
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
