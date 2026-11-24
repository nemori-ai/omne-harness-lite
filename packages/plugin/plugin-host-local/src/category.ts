import {
  heldPoint,
  judgePackageContent,
  readBodyText,
  withinDirectory,
  type BodyContract,
  type CategoryDisplay,
  type CategoryListing,
  type CategoryView,
  type JsonValue,
  type PackageLayout,
  type PackageReader,
  type PackageRejection,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  MANIFEST_FILE,
  judgePackage,
  membersOf,
  readManifest,
  type PlacedMember,
  type PluginManifest,
} from '@omne-harness/plugin-protocol'
import { SKIN_CATEGORY, plainFault, skinFault } from './skin-category.ts'

export const PLUGIN_CATEGORY = 'plugin'

type Fault = (manifest: PluginManifest) => string | null

export const pluginCategoryDisplay: CategoryDisplay = Object.freeze({
  title: 'Plugin',
  summary: '一份清单列出若干成员，每个成员是某个拓展点上的一项；装上就一起生效，卸下就一起回来。',
  creation: '一个目录，根下有 plugin.json；清单里写到的文件与目录放在它旁边。',
  authoring: [
    'plugin.json, whole and minimal:',
    '{"schema":1,"name":"brand-green","summary":"One sentence on what it does.","client":{"members":[{"point":"shell.tokens","key":"shell.app","data":{"--omne-accent":"#0a7a4a"}}]}}',
    'A manifest reads schema (always 1), name (lower-case letters, digits and hyphens), summary, client and server; kind is written by a skin alone (category skin). Other fields are not read.',
    'A member names a point and a key and gives exactly one of: data (a JSON value); module with export (a .js file in this directory and the name it exports); directory (a directory in this directory).',
    'Members of the interface go under client, members of the server under server. OmneExtensionPoints show with the name of a point says what that point takes and gives a member to copy.',
  ].join('\n'),
})

export const pluginPluginsPoint = heldPoint({
  name: 'plugin.plugins',
  key: 'the plugin name',
  summary:
    'The plugins held: each is a manifest of members, and its members are put when it is loaded.',
})

/** A plugin package is held to no most: not in the number of its files, nor in the size of one or of all. */
export const PLUGIN_PACKAGE_LIMITS = Object.freeze({
  files: Number.MAX_SAFE_INTEGER,
  fileBytes: Number.MAX_SAFE_INTEGER,
  totalBytes: Number.MAX_SAFE_INTEGER,
})

const BODY_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 32,
  maxItems: 50_000,
  maxMembers: 1024,
  maxStringLength: 65_536,
  maxNumberLength: 32,
})

type Verdict =
  | Readonly<{ ok: true }>
  | Readonly<{ unfit: string }>
  | Readonly<{ unavailable: true }>

const FIT: Verdict = Object.freeze({ ok: true })

/** What a rejection of a package says, as one word a reader can act on. */
function said(rejection: PackageRejection): string {
  if (rejection.kind === 'limit-exceeded') return `limit-exceeded:${rejection.limit}`
  if (rejection.kind === 'invalid-package' || rejection.kind === 'record-rejected')
    return rejection.reason
  return rejection.kind === 'source-failed' ? `source-failed:${rejection.failure}` : rejection.kind
}

async function judgeDirectory(
  contract: BodyContract,
  pkg: PackageReader,
  directory: string,
  key: string,
): Promise<Verdict> {
  const judged = await judgePackageContent(contract, withinDirectory(pkg, directory), key)
  if ('ok' in judged) return FIT
  const { failure } = judged
  return failure.kind === 'source-failed' && failure.failure === 'unavailable'
    ? { unavailable: true }
    : { unfit: `the category ${contract.category} says ${said(failure)}` }
}

function judgeData(contract: BodyContract, data: unknown, key: string): Verdict {
  const read = readBodyText(JSON.stringify(data), BODY_LIMITS)
  if (read.kind !== 'ok') return { unfit: `the category ${contract.category} says ${read.kind}` }
  const judged = contract.judge(read.value, { capabilityName: key })
  return judged.ok ? FIT : { unfit: `the category ${contract.category} says ${judged.rejected}` }
}

/** Judges one member that points at the point of a usable category, by the contract of that category. */
async function judgeByCategory(
  listing: CategoryListing,
  contract: BodyContract,
  { side, member }: PlacedMember,
  pkg: PackageReader,
): Promise<Verdict> {
  const { category, creation } = listing
  if (category === PLUGIN_CATEGORY || category === SKIN_CATEGORY)
    return { unfit: `a plugin does not hold a ${category}` }
  if (creation === 'none')
    return { unfit: `the category ${category} is not created through the general entry` }
  if (side === 'client')
    return {
      unfit: `the point of the category ${category} is on the server; write the member on the server side`,
    }
  if (creation === 'directory')
    return 'directory' in member
      ? judgeDirectory(contract, pkg, member.directory, member.key)
      : { unfit: `the category ${category} takes a directory` }
  return 'data' in member
    ? judgeData(contract, member.data, member.key)
    : { unfit: `the category ${category} takes data` }
}

async function judgeMember(
  categories: CategoryView,
  placed: PlacedMember,
  pkg: PackageReader,
): Promise<Verdict> {
  const standing = categories.atPoint(placed.member.point)
  if (standing === undefined) return FIT
  if ('unusable' in standing) return { unavailable: true }
  const contract = categories.lookup(standing.category)
  return contract === undefined
    ? { unavailable: true }
    : judgeByCategory(standing, contract, placed, pkg)
}

const UNAVAILABLE = fail({ kind: 'source-failed', failure: 'unavailable' } as const)
const invalid = (reason: string) => fail({ kind: 'invalid-package', reason } as const)

async function readPackage(
  pkg: PackageReader,
  fault: Fault,
): Promise<Outcome<Readonly<{ manifest: PluginManifest; body: JsonValue }>, PackageRejection>> {
  const listed = await pkg.manifest()
  if (!('ok' in listed)) return fail({ kind: 'source-failed', failure: listed.failure })
  const entry = listed.ok.entries.find(found => found.path === MANIFEST_FILE)
  if (entry === undefined) return invalid(`the package has no ${MANIFEST_FILE}`)
  const opened = await pkg.open(entry.path, entry.digest)
  if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
  const text = new TextDecoder().decode(opened.ok)
  const read = readManifest(text)
  if (read.kind === 'refused') return invalid(read.reason)
  const held = judgePackage(read.manifest, listed.ok.entries)
  if (!held.ok) return invalid(held.reason)
  const unfit = fault(read.manifest)
  if (unfit !== null) return invalid(unfit)
  const body = readBodyText(text, BODY_LIMITS)
  return body.kind === 'ok'
    ? succeed({ manifest: read.manifest, body: body.value })
    : invalid(`the manifest is beyond what a body may be: ${body.kind}`)
}

function layoutOf(categories: CategoryView, namespace: string, fault: Fault): PackageLayout {
  return {
    namespace,
    limits: PLUGIN_PACKAGE_LIMITS,
    async inspect(pkg) {
      const read = await readPackage(pkg, fault)
      if (!('ok' in read)) return read
      for (const placed of membersOf(read.ok.manifest)) {
        const verdict = await judgeMember(categories, placed, pkg)
        if ('unavailable' in verdict) return UNAVAILABLE
        const { at, member } = placed
        if ('unfit' in verdict)
          return invalid(`${at} (${member.point}, ${member.key}): ${verdict.unfit}`)
      }
      return succeed(read.ok.body)
    },
  }
}

/** The manifest a body carries: the body is the manifest as written, with the file list of its package beside it. */
function manifestOf(body: unknown): PluginManifest | string {
  const tree = body as JsonValue | null
  if (typeof tree !== 'object' || tree === null || tree.kind !== 'object')
    return 'the body is not a manifest'
  const written = tree.entries.filter(entry => entry.key !== 'manifest')
  const read = readManifest(writeJsonText({ kind: 'object', entries: written }))
  return read.kind === 'read' ? read.manifest : read.reason
}

function judged(fault: Fault): BodyContract['judge'] {
  return (body, context) => {
    const manifest = manifestOf(body)
    if (typeof manifest === 'string') return { ok: false, rejected: manifest }
    const unfit = fault(manifest)
    if (unfit !== null) return { ok: false, rejected: unfit }
    const published = context?.capabilityName
    return published === undefined || published === manifest.name
      ? { ok: true }
      : {
          ok: false,
          rejected: `the manifest names ${manifest.name}; it is published as ${published}`,
        }
  }
}

function packageContract(
  categories: CategoryView,
  category: string,
  namespace: string,
  fault: Fault,
): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    layout: layoutOf(categories, namespace, fault),
    judge: judged(fault),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  }
}

/** Plugin as a category. A manifest that says it is a skin is not held here. */
export function pluginBodyContract(categories: CategoryView): BodyContract {
  return packageContract(categories, PLUGIN_CATEGORY, 'plugins', plainFault)
}

/** Skin as a category: the contract of Plugin, narrowed to a manifest that says it is a skin and writes no server side. */
export function skinBodyContract(categories: CategoryView): BodyContract {
  return packageContract(categories, SKIN_CATEGORY, 'skins', skinFault)
}
