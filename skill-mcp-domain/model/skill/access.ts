// Skill 限界上下文：SkillAccess 的参考实现（@omne-harness/skill 的 src/access.ts 候选）。
// 目的：让编译器证明「读取 11 步」与失败联合一一对应——每一步只能返回它签名里的种类。
// 风格：工厂函数 + 闭包，不用类（无状态服务，仓库约定类只给有状态聚合与 Cordis Service）。

import { fail, succeed, assertNever, type Access, type CapabilityId, type Outcome } from '../shared.ts'
import type { DescribeFailure, ExportFailure, GateFailure, ListFailure, PinFailure, ReadFailure } from './failures.ts'
import { computeDigest, isControlFile, toPackagePath } from './functions.ts'
import type { Resolution, SkillPorts, SourceFailure } from './ports.ts'
import type { AccessConfig, ReadResult, SkillAccess, SkillDescription } from './services.ts'
import type {
  PackageDigest,
  PackageEntry,
  SkillMaterialBasis,
  SkillPackageSnapshot,
  SkillRef,
} from './values.ts'

const capabilityEquals = (a: CapabilityId, b: CapabilityId): boolean =>
  a.category === b.category && a.name === b.name

/** 端口答复 → 服务失败。按表穷尽，新增答复种类时编译失败。 */
export function mapResolution(
  answer: Resolution,
): Outcome<Extract<Resolution, { kind: 'adopted' }>, DescribeFailure> {
  switch (answer.kind) {
    case 'adopted':
      return succeed(answer)
    case 'known-unavailable': {
      const { capability, name, reason, description } = answer
      const standIn = description === undefined ? { capability, name, reason } : { capability, name, reason, description }
      return fail({ kind: 'unavailable-stand-in', standIn })
    }
    case 'basis-not-lawful':
      return fail({ kind: 'basis-unavailable' })
    case 'none':
      return fail({ kind: 'not-available-to-you' })
    case 'unknown':
      return fail({ kind: 'unknown' })
    default:
      return assertNever(answer)
  }
}

/** 来源失败 → 服务失败。package-not-found 随「带不带依据」分两种。 */
export type ByteFailure = Extract<
  ReadFailure,
  { kind: 'basis-unavailable' | 'source-unavailable' | 'resource-missing' | 'version-changed' | 'outside-package' }
>

export function mapSourceFailure(failure: SourceFailure, pinnedByBasis: boolean): ByteFailure {
  switch (failure) {
    case 'package-not-found':
      return pinnedByBasis ? { kind: 'basis-unavailable' } : { kind: 'source-unavailable' }
    case 'entry-not-found':
      return { kind: 'resource-missing' }
    case 'bytes-mismatch':
      return { kind: 'version-changed' }
    case 'outside-package':
      return { kind: 'outside-package' }
    case 'unavailable':
      return { kind: 'source-unavailable' }
    default:
      return assertNever(failure)
  }
}

type Pinned = Readonly<{ ref: SkillRef; digest: PackageDigest; byBasis: boolean; snapshot: SkillPackageSnapshot }>

export function createSkillAccess<P, S>(ports: SkillPorts<P, S>, config: AccessConfig): SkillAccess<P, S> {
  const { readCheck, resolution, source } = ports

  // 第 1–3 步：依据身份、读取权、对应。四个操作共用。
  async function gate(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis: SkillMaterialBasis | undefined,
  ): Promise<Outcome<Extract<Resolution, { kind: 'adopted' }>, DescribeFailure>> {
    if (basis !== undefined && !capabilityEquals(basis.capability, capability))
      return fail({ kind: 'not-available-to-you' }) // 内部 bad-basis，对外不披露差异
    const verdict = await readCheck.check(access, scope, capability)
    if (verdict === 'refused') return fail({ kind: 'not-available-to-you' })
    if (verdict === 'unknown') return fail({ kind: 'unknown' })
    const answer = await resolution.resolve(access, scope, capability, basis === undefined ? {} : { basis })
    return mapResolution(answer)
  }

  // 第 5、7 步：钉住内容摘要，取快照比较。
  async function pin(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis: SkillMaterialBasis | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Outcome<Pinned, PinFailure>> {
    const gated = await gate(access, scope, capability, basis)
    if ('failure' in gated) return gated
    const { ref } = gated.ok
    if (ref.digest === undefined) return fail({ kind: 'unsupported', what: 'no-readable-package' })
    const digest = basis?.digest ?? ref.digest
    if (signal?.aborted === true) return fail({ kind: 'aborted' })
    const snap = await source.snapshot(ref.locator)
    if ('failure' in snap) {
      const mapped = mapSourceFailure(snap.failure, basis !== undefined)
      // 取快照只会答 package-not-found / unavailable；其余种类说明来源不守契约，按不可达处理。
      return fail(mapped.kind === 'basis-unavailable' || mapped.kind === 'source-unavailable' ? mapped : { kind: 'source-unavailable' })
    }
    if (snap.ok.digest !== digest)
      return fail(basis !== undefined ? { kind: 'basis-unavailable' } : { kind: 'adopted-material-changed' })
    return succeed({ ref, digest, byBasis: basis !== undefined, snapshot: snap.ok })
  }

  function basisOf(ref: SkillRef, digest: PackageDigest): SkillMaterialBasis {
    return ref.assetVersion === undefined
      ? { capability: ref.capability, layer: ref.layer, digest }
      : { capability: ref.capability, layer: ref.layer, assetVersion: ref.assetVersion, digest }
  }

  async function verifiedBytes(pinned: Pinned, entry: PackageEntry): Promise<Outcome<Uint8Array, ByteFailure>> {
    const opened = await source.open(pinned.ref.locator, pinned.digest, entry.path)
    if ('failure' in opened) return fail(mapSourceFailure(opened.failure, pinned.byBasis))
    if (computeDigest(opened.ok) !== entry.digest) return fail({ kind: 'version-changed' })
    return succeed(opened.ok)
  }

  return {
    async describe(access, scope, capability, options = {}) {
      const gated = await gate(access, scope, capability, options.basis)
      if ('failure' in gated) return gated
      const { ref, declared } = gated.ok
      const description: SkillDescription = {
        capability: ref.capability,
        layer: ref.layer,
        material: ref.digest === undefined ? { kind: 'no-readable-package' } : { kind: 'pinned', basis: basisOf(ref, options.basis?.digest ?? ref.digest) },
        dependencies: declared.tools,
        scripts: declared.scripts,
        settings: declared.settings,
        addressing: 'package-relative-path',
      }
      return succeed(description)
    },

    async read(access, scope, target, options = {}): Promise<Outcome<ReadResult, ReadFailure>> {
      // 第 6 步在第 7 步之前不需要端口，但次序按组页：先识别与对应，再校验路径。
      const pinned = await pin(access, scope, target.capability, options.basis, options.signal)
      if ('failure' in pinned) return pinned
      let path
      if (target.part.kind === 'resource') {
        const checked = toPackagePath(target.part.path)
        if ('failure' in checked) return fail({ kind: 'bad-path' })
        if (isControlFile(checked.ok)) return fail({ kind: 'bad-path' }) // 控制文件不是资源
        path = checked.ok
      }
      const wanted = path ?? ('SKILL.md' as const)
      const entry = pinned.ok.snapshot.entries.find(candidate => candidate.path === wanted)
      if (entry === undefined) return fail({ kind: 'resource-missing' })
      if (options.signal?.aborted === true) return fail({ kind: 'aborted' })
      const bytes = await verifiedBytes(pinned.ok, entry)
      if ('failure' in bytes) return bytes
      // 第 11 步：按字节范围截取。正文要去掉头部，按 UTF-8 切页的规则归 SPEC，此处省略。
      const start = options.range?.start ?? 0
      const length = Math.min(options.range?.length ?? config.readDefaultLength, Math.max(0, bytes.ok.length - start))
      const slice = bytes.ok.subarray(start, start + length)
      return succeed({
        basis: basisOf(pinned.ok.ref, pinned.ok.digest),
        part: path === undefined ? { kind: 'body' } : { kind: 'resource', path },
        ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
        content: entry.encoding === 'text' ? { kind: 'text', text: new TextDecoder().decode(slice) } : { kind: 'bytes', bytes: slice },
        range: { start, length: slice.length },
        total: bytes.ok.length,
        complete: start + slice.length >= bytes.ok.length,
      })
    },

    async list(access, scope, capability, options = {}): Promise<Outcome<{ basis: SkillMaterialBasis; resources: readonly PackageEntry[] }, ListFailure>> {
      const pinned = await pin(access, scope, capability, options.basis, options.signal)
      if ('failure' in pinned) return pinned
      return succeed({
        basis: basisOf(pinned.ok.ref, pinned.ok.digest),
        resources: pinned.ok.snapshot.entries.filter(entry => !isControlFile(entry.path)),
      })
    },

    async export(access, scope, capability, basis, options = {}) {
      const pinned = await pin(access, scope, capability, basis, options.signal)
      if ('failure' in pinned) {
        // 带依据时 pin 不会产出 adopted-material-changed；类型上排除它。
        const failure = pinned.failure
        return fail(failure.kind === 'adopted-material-changed' ? { kind: 'basis-unavailable' } : failure)
      }
      const entries = []
      for (const entry of pinned.ok.snapshot.entries) {
        const bytes = await verifiedBytes(pinned.ok, entry)
        if ('failure' in bytes) return bytes
        entries.push({ path: entry.path, size: entry.size, digest: entry.digest, bytes: bytes.ok, ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }) })
      }
      return succeed({ basis: basisOf(pinned.ok.ref, pinned.ok.digest), digest: pinned.ok.digest, entries })
    },
  }
}

export type { GateFailure }
