import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BUILTIN, PAGE_VERSIONS_DIR, pageVersions } from '../src/main/page-versions.ts'
import { publisher, smallBundle } from './support/page-bundle.ts'

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'page-versions-')))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let count = 0
const fresh = (name: string): string => join(scratch, `${name}-${String(count++)}`)
const key = publisher()
const builtinRoot = join(scratch, 'shipped-page')
const versionsOf = (userData: string, keys: readonly string[] = [key.publicKey]) =>
  pageVersions({ userData, builtinRoot, publisherKeys: keys })
const shipped = { version: BUILTIN, root: builtinRoot, settled: true }

describe('页面包的版本', () => {
  it('什么都没装：在服务的是应用自带的那一版', async () => {
    expect(await versionsOf(fresh('user')).serving()).toEqual(shipped)
  })

  it('装一版签过名的：进版本目录，名字带内容摘要；切过去之后在服务的是它；起稳了它成为退路', async () => {
    const userData = fresh('user')
    const versions = versionsOf(userData)
    const installed = await versions.install(smallBundle(fresh('bundle'), 'two', key))
    expect(installed).toEqual({
      kind: 'installed',
      version: expect.stringMatching(/^page-[0-9a-f]{12}$/),
    })
    if (installed.kind !== 'installed') return
    const { version } = installed
    expect(await versions.serving()).toEqual(shipped)
    expect(versions.switchTo(version)).toEqual({
      outcome: 'moved',
      pointer: { current: version, previous: BUILTIN, settled: false },
    })
    const root = join(userData, PAGE_VERSIONS_DIR, 'versions', version)
    expect(await versions.serving()).toEqual({ version, root, settled: false })
    expect(versions.tell(version, 'settled').pointer).toEqual({
      current: version,
      previous: version,
      settled: true,
    })
    expect(await versions.serving()).toEqual({ version, root, settled: true })
  })

  it('没签名的、签名不是发行方的、被改过文件的：装不上，写明原因', async () => {
    const versions = versionsOf(fresh('user'))
    const unsigned = await versions.install(smallBundle(fresh('bundle'), 'unsigned'))
    expect(unsigned).toMatchObject({ kind: 'refused', reason: 'signature-missing' })
    const stranger = await versions.install(smallBundle(fresh('bundle'), 'stranger', publisher()))
    expect(stranger).toMatchObject({ kind: 'refused', reason: 'signature-invalid' })
    const changed = smallBundle(fresh('bundle'), 'changed', key)
    writeFileSync(join(changed, 'index.html'), '<!doctype html><title>other</title>')
    expect(await versions.install(changed)).toMatchObject({
      kind: 'refused',
      reason: 'digest-mismatch',
    })
    expect(await versions.serving()).toEqual(shipped)
  })

  it('应用没带发行公钥：什么都装不上', async () => {
    const versions = versionsOf(fresh('user'), [])
    expect(await versions.install(smallBundle(fresh('bundle'), 'x', key))).toMatchObject({
      kind: 'refused',
      reason: 'signature-invalid',
    })
  })

  it('装进来的第一版连着起不来到上限：指针退回自带的那一版', async () => {
    const versions = versionsOf(fresh('user'))
    const installed = await versions.install(smallBundle(fresh('bundle'), 'bad', key))
    if (installed.kind !== 'installed') throw new Error('not installed')
    versions.switchTo(installed.version)
    expect(versions.tell(installed.version, 'fell-to-limit')).toEqual({
      outcome: 'rolled-back',
      pointer: { current: BUILTIN, previous: BUILTIN, settled: true },
    })
    expect(await versions.serving()).toEqual(shipped)
  })

  it('指针指着的那一版被改过或不在了：这一次用自带的那一版，并写明哪一版为什么用不了', async () => {
    const userData = fresh('user')
    const versions = versionsOf(userData)
    const installed = await versions.install(smallBundle(fresh('bundle'), 'tampered', key))
    if (installed.kind !== 'installed') throw new Error('not installed')
    const { version } = installed
    versions.switchTo(version)
    const root = join(userData, PAGE_VERSIONS_DIR, 'versions', version)
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>changed after install</title>')
    expect(await versions.serving()).toEqual({
      ...shipped,
      unusable: { version, reason: 'digest-mismatch' },
    })
    rmSync(join(userData, PAGE_VERSIONS_DIR, 'versions'), { recursive: true })
    expect(await versions.serving()).toEqual({
      ...shipped,
      unusable: { version, reason: 'manifest-missing' },
    })
    rmSync(join(userData, PAGE_VERSIONS_DIR), { recursive: true })
    expect(await versions.serving()).toEqual(shipped)
  })
})
