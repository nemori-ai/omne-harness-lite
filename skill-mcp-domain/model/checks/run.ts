// 草图的可执行核对：node --experimental-strip-types checks/run.ts
// 只核对草图里已写出实现的部分；不是成员的测试，实施时改写成 vitest 并按行为断言。

import assert from 'node:assert/strict'
import type { CapabilityId, TenantId } from '../shared.ts'
import { computeDigest, sealSnapshot, toPackagePath, toSkillName } from '../skill/functions.ts'
import { createSkillAccess } from '../skill/access.ts'
import type { SkillPorts } from '../skill/ports.ts'
import type { ExportFailure } from '../skill/failures.ts'
import type { PackageEntry, PackagePath, SkillName, SkillRef } from '../skill/values.ts'
import { mergeListing, completeListing, type CatalogState } from '../mcp/catalog.ts'
import { Connection } from '../mcp/connection.ts'
import { InFlightCalls } from '../mcp/in-flight.ts'
import type {
  ActionDefinition,
  ActionName,
  AdoptionRevision,
  CorrelationKey,
  DefinitionDigest,
  EndpointHolding,
  Generation,
  PeerIdentity,
  ProtocolVersion,
} from '../mcp/values.ts'

let passed = 0
async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  await body()
  passed += 1
  console.log(`ok  ${name}`)
}

// ─────────────── 类型层：编译通过即成立 ───────────────
// export 必须带依据，所以它的失败里没有 adopted-material-changed。
type NoAdoptedChange = Extract<ExportFailure, { kind: 'adopted-material-changed' }> extends never ? true : false
const exportHonest: NoAdoptedChange = true
void exportHonest

// ─────────────── Skill ───────────────
const capability = { category: 'skill', name: 'pdf' } as CapabilityId
const encoder = new TextEncoder()
const files: Record<string, Uint8Array> = {
  'SKILL.md': encoder.encode('---\nname: pdf\ndescription: d\n---\nbody'),
  'ref/a.md': encoder.encode('A'),
}
const entryOf = (path: string): PackageEntry => ({
  path: path as PackagePath,
  encoding: 'text',
  size: files[path]!.length,
  digest: computeDigest(files[path]!),
})

await check('toPackagePath 拒绝绝对路径、.. 段与反斜杠', () => {
  for (const bad of ['/etc', '../x', 'a/../b', 'a\\b', '', 'a//b']) assert.ok('failure' in toPackagePath(bad), bad)
  assert.deepEqual(toPackagePath('./ref/a.md'), { ok: 'ref/a.md' })
})

await check('toSkillName 守官方词法', () => {
  for (const bad of ['PDF', '-a', 'a-', 'a--b', 'x'.repeat(65)]) assert.ok('failure' in toSkillName(bad), bad)
  assert.ok('ok' in toSkillName('pdf-tools'))
})

await check('sealSnapshot 查出不相邻的前缀冲突（a、a-b、a/b）', () => {
  const entry = (path: string): PackageEntry => ({ path: path as PackagePath, encoding: 'text', size: 0, digest: computeDigest(new Uint8Array()) })
  const sealed = sealSnapshot('pkg', [entry('a'), entry('a-b'), entry('a/b')])
  assert.deepEqual(sealed, { failure: { kind: 'prefix-conflict', file: 'a', nested: 'a/b' } })
})

await check('sealSnapshot 的内容摘要与条目次序无关、与包根目录名无关', () => {
  const one = sealSnapshot('x', [entryOf('SKILL.md'), entryOf('ref/a.md')])
  const two = sealSnapshot('y', [entryOf('ref/a.md'), entryOf('SKILL.md')])
  assert.ok('ok' in one && 'ok' in two)
  assert.equal(one.ok.digest, two.ok.digest)
})

function skillWorld(options: { mutateAfterSnapshot?: boolean; readVerdict?: 'granted' | 'refused' | 'unknown' } = {}) {
  const snapshot = sealSnapshot('pdf', [entryOf('SKILL.md'), entryOf('ref/a.md')])
  assert.ok('ok' in snapshot)
  const ref: SkillRef = { capability, layer: 'workspace', locator: { kind: 'directory', root: '/w/pdf' }, digest: snapshot.ok.digest }
  const ports: SkillPorts<string, 'ws'> = {
    readCheck: { check: async () => options.readVerdict ?? 'granted' },
    resolution: {
      resolve: async () => ({ kind: 'adopted', ref, declared: { name: 'pdf' as SkillName, tools: [], scripts: [], settings: [] } }),
      adopted: async () => ({ ok: [] }),
    },
    source: {
      snapshot: async () => ({ ok: snapshot.ok }),
      open: async (_l, _d, path) =>
        options.mutateAfterSnapshot === true ? { ok: encoder.encode('changed') } : { ok: files[path]! },
    },
  }
  return { ports, snapshot: snapshot.ok }
}
const access = { principal: 'u1', tenant: {} as TenantId }

await check('read：依据身份不符对外答 not-available-to-you，不调端口', async () => {
  const { ports, snapshot } = skillWorld({ readVerdict: 'unknown' }) // 若调了端口会答 unknown
  const skill = createSkillAccess(ports, { readDefaultLength: 1024 })
  const other = { category: 'skill', name: 'other' } as CapabilityId
  const result = await skill.read(access, 'ws', { capability, part: { kind: 'body' } }, { basis: { capability: other, layer: 'workspace', digest: snapshot.digest } })
  assert.deepEqual(result, { failure: { kind: 'not-available-to-you' } })
})

await check('read：读取权 refused → not-available-to-you', async () => {
  const skill = createSkillAccess(skillWorld({ readVerdict: 'refused' }).ports, { readDefaultLength: 1024 })
  assert.deepEqual(await skill.read(access, 'ws', { capability, part: { kind: 'body' } }), { failure: { kind: 'not-available-to-you' } })
})

await check('read：控制文件不是资源 → bad-path', async () => {
  const skill = createSkillAccess(skillWorld().ports, { readDefaultLength: 1024 })
  assert.deepEqual(await skill.read(access, 'ws', { capability, part: { kind: 'resource', path: '.omne/skill.json' } }), { failure: { kind: 'bad-path' } })
})

await check('read：字节在快照之后被改 → version-changed，不交新内容', async () => {
  const skill = createSkillAccess(skillWorld({ mutateAfterSnapshot: true }).ports, { readDefaultLength: 1024 })
  assert.deepEqual(await skill.read(access, 'ws', { capability, part: { kind: 'resource', path: 'ref/a.md' } }), { failure: { kind: 'version-changed' } })
})

await check('read：带旧依据而快照已变 → basis-unavailable；不带依据 → adopted-material-changed', async () => {
  const { ports } = skillWorld()
  const stale = { capability, layer: 'workspace' as const, digest: 'sha256:old' as never }
  const skill = createSkillAccess(ports, { readDefaultLength: 1024 })
  assert.deepEqual(await skill.read(access, 'ws', { capability, part: { kind: 'body' } }, { basis: stale }), { failure: { kind: 'basis-unavailable' } })
  const moved = createSkillAccess({ ...ports, resolution: { ...ports.resolution, resolve: async () => ({ kind: 'adopted', ref: { capability, layer: 'workspace', locator: { kind: 'directory', root: '/w' }, digest: 'sha256:old' as never }, declared: { name: 'pdf' as SkillName, tools: [], scripts: [], settings: [] } }) } }, { readDefaultLength: 1024 })
  assert.deepEqual(await moved.read(access, 'ws', { capability, part: { kind: 'body' } }), { failure: { kind: 'adopted-material-changed' } })
})

await check('read：成功结果如实标出依据，部分结果用 complete 标出', async () => {
  const { ports, snapshot } = skillWorld()
  const skill = createSkillAccess(ports, { readDefaultLength: 1024 })
  const page = await skill.read(access, 'ws', { capability, part: { kind: 'body' } }, { range: { start: 0, length: 3 } })
  assert.ok('ok' in page)
  assert.equal(page.ok.basis.digest, snapshot.digest)
  assert.equal(page.ok.complete, false)
})

// ─────────────── MCP ───────────────
const def = (name: string): ActionDefinition => ({ name: name as ActionName, taskSupport: 'optional', raw: { kind: 'string', value: name } })
const basis = (generation: number) => ({ generation: generation as Generation, protocolVersion: '2026-07-28' as ProtocolVersion, capabilitiesDigest: 'c' })
const fresh = { acquiredAt: '2026-11-03T00:00:00Z', changedNotified: false }
const listing = (names: string[], generation = 1) => {
  const built = completeListing([{ ok: names.map(name => ({ definition: def(name), digest: `d:${name}` as DefinitionDigest })) }], basis(generation), fresh)
  assert.ok('ok' in built)
  return built.ok
}

await check('mergeListing：首次采用修订为 1，空清单也是「已取得」', () => {
  const merged = mergeListing({ kind: 'not-acquired' }, listing([]), { revision: 'absent' })
  assert.ok('ok' in merged)
  assert.equal(merged.ok.revision, 1)
  assert.equal(merged.ok.actions.size, 0)
})

await check('mergeListing：已知动作不静默消失，标为 no-longer-offered 并保留最近合法定义', () => {
  const first = mergeListing({ kind: 'not-acquired' }, listing(['a', 'b']), { revision: 'absent' })
  assert.ok('ok' in first)
  const state: CatalogState = { kind: 'acquired', record: first.ok }
  const second = mergeListing(state, listing(['a']), { revision: first.ok.revision })
  assert.ok('ok' in second)
  const b = second.ok.actions.get('b' as ActionName)
  assert.deepEqual(b?.availability, { kind: 'unavailable', reason: 'no-longer-offered' })
  assert.equal(b?.lastLawful.name, 'b')
})

await check('mergeListing：迟到结果（基于旧修订）被拒绝，不覆盖较新的采用', () => {
  const first = mergeListing({ kind: 'not-acquired' }, listing(['a']), { revision: 'absent' })
  assert.ok('ok' in first)
  const late = mergeListing({ kind: 'acquired', record: first.ok }, listing(['z']), { revision: 'absent' })
  assert.deepEqual(late, { failure: 'stale-revision' })
})

await check('completeListing：任一页失败则整次不采用；重名拒绝', () => {
  assert.deepEqual(completeListing([{ ok: [{ definition: def('a'), digest: 'x' as DefinitionDigest }] }, { failed: true }], basis(1), fresh), { failure: 'page-failed' })
  assert.deepEqual(completeListing([{ ok: [{ definition: def('a'), digest: 'x' as DefinitionDigest }, { definition: def('a'), digest: 'y' as DefinitionDigest }] }], basis(1), fresh), { failure: 'duplicate-action-name' })
})

const key = { tenant: {} as TenantId, holding: 'h' as EndpointHolding, adoptionRevision: 'r1' as AdoptionRevision, account: { kind: 'anonymous' } as const }
const peer = { protocolVersion: '2026-07-28', capabilities: {}, serverInfo: { untrusted: {} } } as unknown as PeerIdentity

await check('Connection（stdio）：每次启动尝试就加一代，失败的尝试也算', () => {
  const connection = Connection.begin(key, 'on-attempt')
  assert.equal(connection.generation, 1)
  assert.ok('ok' in connection.markLost('prepare-failed'))
  assert.ok('ok' in connection.rebuild())
  assert.equal(connection.generation, 2)
  assert.ok('ok' in connection.markReady(peer))
  assert.equal(connection.generation, 2)
  assert.equal(connection.accepts(1 as Generation), false) // 旧代际的迟到响应
})

await check('Connection（HTTP）：协商成功才加一代；degraded 只由 ready 进入', () => {
  const connection = Connection.begin(key, 'on-negotiation')
  assert.equal(connection.generation, 0)
  assert.ok('failure' in connection.markDegraded('x'))
  assert.ok('ok' in connection.markReady(peer))
  assert.equal(connection.generation, 1)
  assert.ok('ok' in connection.markDegraded('list failed'))
  assert.ok('ok' in connection.recover())
  assert.ok('ok' in connection.close('unconfirmed'))
  assert.ok('failure' in connection.rebuild())
})

const tenant = {} as TenantId
const calls = () => new InFlightCalls<string>({ principal: p => p, tenant: () => 't' })
const ck = 'c1' as CorrelationKey

await check('在途表：查重与占位一步；已结束的关联键不算重复', () => {
  const table = calls()
  assert.ok('ok' in table.reserve(tenant, 'u1', ck))
  assert.deepEqual(table.reserve(tenant, 'u1', ck), { failure: 'correlation-key-in-use' })
  assert.ok('ok' in table.reserve(tenant, 'u2', ck)) // 不同主体互不影响
  table.markEnded(tenant, 'u1', ck)
  assert.ok('ok' in table.reserve(tenant, 'u1', ck))
})

await check('在途表：占位后、发出前被取消 → 不发出', () => {
  const table = calls()
  table.reserve(tenant, 'u1', ck)
  assert.equal(table.cancel(tenant, 'u1', ck, () => true).answer, 'signalled')
  assert.deepEqual(table.markSent(tenant, 'u1', ck, { requestId: 'r', generation: 1 as Generation, abort: new AbortController() }), { failure: 'cancelled-before-send' })
})

await check('在途表：别的主体取消不了；表里没有的键答 unknown；代际已换答 unknown', () => {
  const table = calls()
  table.reserve(tenant, 'u1', ck)
  const abort = new AbortController()
  table.markSent(tenant, 'u1', ck, { requestId: 'r', generation: 1 as Generation, abort })
  assert.equal(table.cancel(tenant, 'u2', ck, () => true).answer, 'unknown')
  assert.equal(table.cancel(tenant, 'u1', ck, g => g === 2).answer, 'unknown')
  assert.equal(abort.signal.aborted, false)
  assert.equal(table.cancel(tenant, 'u1', ck, () => true).answer, 'signalled')
  assert.equal(abort.signal.aborted, true)
})

console.log(`\n${passed} 项通过`)
