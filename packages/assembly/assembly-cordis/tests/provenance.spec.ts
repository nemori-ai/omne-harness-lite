import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadDirectoryFile,
  loadVersion,
  MANIFEST_FILE,
  SIGNATURE_FILE,
  verifyVersion,
  type Trust,
} from '../src/index.ts'

const scratch: string[] = []
afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const hex = (text: string): string => createHash('sha256').update(text).digest('hex')
const keys = () => generateKeyPairSync('ed25519')
const pem = (key: KeyObject): string => key.export({ type: 'spki', format: 'pem' }).toString()

type Made = { directory: string; publicKey: string; privateKey: KeyObject }

/** A version directory as the publisher ships it: the files, the manifest of their digests, its signature. */
function version(
  files: Record<string, string> = {
    'row.mjs': "export const version = 'v1'\n",
    'lib/part.mjs': 'export const part = 1\n',
  },
): Made {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'version-')))
  scratch.push(directory)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true })
    writeFileSync(join(directory, path), text)
  }
  const manifest = JSON.stringify({
    format: 1,
    entry: 'row.mjs',
    files: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, hex(text)])),
  })
  const { publicKey, privateKey } = keys()
  writeFileSync(join(directory, MANIFEST_FILE), manifest)
  writeFileSync(
    join(directory, SIGNATURE_FILE),
    sign(null, Buffer.from(manifest), privateKey).toString('base64'),
  )
  return { directory, publicKey: pem(publicKey), privateKey }
}

const publisher = (made: Made): Trust => ({ publisherKeys: [made.publicKey], named: [] })

describe('来源：发行方的制品（C20）', () => {
  it('签名与每个文件的摘要都对：核过，答入口文件', async () => {
    const made = version()
    expect(await verifyVersion(made.directory, publisher(made))).toEqual({
      kind: 'verified',
      by: 'publisher',
      entry: 'row.mjs',
      digest: hex("export const version = 'v1'\n"),
    })
    const loaded = await loadVersion(made.directory, publisher(made))
    expect(loaded).toMatchObject({ kind: 'loaded', by: 'publisher' })
    expect(loaded.kind === 'loaded' && loaded.module).toMatchObject({ version: 'v1' })
  })

  it('改了一个文件而没重新签名：装不上，原因写明是哪个文件', async () => {
    const made = version()
    writeFileSync(join(made.directory, 'lib/part.mjs'), 'export const part = 2\n')
    expect(await loadVersion(made.directory, publisher(made))).toEqual({
      kind: 'refused',
      reason: 'digest-mismatch',
      detail: 'lib/part.mjs does not match its digest in the manifest',
    })
  })

  it('改了清单而没重新签名：签名核不过', async () => {
    const made = version()
    // The manifest now lists the digest of a changed file: every file matches it, the signature does not.
    writeFileSync(join(made.directory, 'row.mjs'), "export const version = 'evil'\n")
    const tampered = JSON.stringify({
      format: 1,
      entry: 'row.mjs',
      files: {
        'row.mjs': hex("export const version = 'evil'\n"),
        'lib/part.mjs': hex('export const part = 1\n'),
      },
    })
    writeFileSync(join(made.directory, MANIFEST_FILE), tampered)
    expect(await verifyVersion(made.directory, publisher(made))).toEqual({
      kind: 'refused',
      reason: 'signature-invalid',
      detail: 'no key of the publisher verifies the signature of the manifest',
    })
  })

  it('用别人的私钥签的：签名核不过；发行里没有公钥也一样', async () => {
    const made = version()
    const other: Trust = { publisherKeys: [pem(keys().publicKey)], named: [] }
    expect(await verifyVersion(made.directory, other)).toMatchObject({
      reason: 'signature-invalid',
    })
    expect(await verifyVersion(made.directory, { publisherKeys: [], named: [] })).toMatchObject({
      reason: 'signature-invalid',
    })
  })

  it('几把公钥里有一把核得过就算过：换钥匙的那段时间新旧都认', async () => {
    const made = version()
    const trust: Trust = { publisherKeys: [pem(keys().publicKey), made.publicKey], named: [] }
    expect(await verifyVersion(made.directory, trust)).toMatchObject({ kind: 'verified' })
  })

  it('没有签名文件，或签名不是合法的 base64 签名：装不上', async () => {
    const made = version()
    rmSync(join(made.directory, SIGNATURE_FILE))
    expect(await verifyVersion(made.directory, publisher(made))).toMatchObject({
      kind: 'refused',
      reason: 'signature-missing',
    })
    writeFileSync(join(made.directory, SIGNATURE_FILE), 'not a signature')
    expect(await verifyVersion(made.directory, publisher(made))).toMatchObject({
      reason: 'signature-invalid',
    })
  })

  it('目录里有清单上没有的文件：装不上，原因写明是哪个', async () => {
    const made = version()
    writeFileSync(join(made.directory, 'lib/extra.mjs'), 'export {}\n')
    expect(await verifyVersion(made.directory, publisher(made))).toEqual({
      kind: 'refused',
      reason: 'unlisted-file',
      detail: 'lib/extra.mjs is in the directory and not in the manifest',
    })
  })

  it('清单上有的文件不在目录里：装不上', async () => {
    const made = version()
    rmSync(join(made.directory, 'lib/part.mjs'))
    expect(await verifyVersion(made.directory, publisher(made))).toMatchObject({
      reason: 'file-missing',
      detail: 'lib/part.mjs is in the manifest and not in the directory',
    })
  })

  it('目录里有软链接：装不上，不跟着它走', async () => {
    const made = version()
    symlinkSync('/etc/hosts', join(made.directory, 'lib/link'))
    expect(await verifyVersion(made.directory, publisher(made))).toMatchObject({
      reason: 'unlisted-file',
    })
  })

  it('没有清单、清单不是这一格式、入口不在清单里：装不上', async () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'version-')))
    scratch.push(empty)
    const trust: Trust = { publisherKeys: [], named: [] }
    expect(await verifyVersion(empty, trust)).toMatchObject({ reason: 'manifest-missing' })
    writeFileSync(join(empty, MANIFEST_FILE), '{"format":2}')
    expect(await verifyVersion(empty, trust)).toMatchObject({ reason: 'manifest-invalid' })
    writeFileSync(join(empty, MANIFEST_FILE), '{"format":1,"entry":"../row.mjs","files":{}}')
    expect(await verifyVersion(empty, trust)).toMatchObject({ reason: 'manifest-invalid' })
    // A path that leaves the directory is no path of a manifest, even when the entry is listed.
    writeFileSync(
      join(empty, MANIFEST_FILE),
      '{"format":1,"entry":"../row.mjs","files":{"../row.mjs":"00"}}',
    )
    expect(await verifyVersion(empty, { publisherKeys: [], named: [empty] })).toMatchObject({
      reason: 'manifest-invalid',
    })
    writeFileSync(join(empty, MANIFEST_FILE), 'not json')
    expect(await verifyVersion(empty, trust)).toMatchObject({ reason: 'manifest-invalid' })
  })
})

describe('来源：运维者点了名的目录（C20）', () => {
  it('点了名：不要签名也装得上；改过文件也装得上，运维者为它作保', async () => {
    const made = version()
    rmSync(join(made.directory, SIGNATURE_FILE))
    writeFileSync(join(made.directory, 'lib/part.mjs'), 'export const part = 2\n')
    const trust: Trust = { publisherKeys: [], named: [made.directory] }
    expect(await verifyVersion(made.directory, trust)).toEqual({
      kind: 'verified',
      by: 'operator',
      entry: 'row.mjs',
      digest: hex("export const version = 'v1'\n"),
    })
    expect(await loadVersion(made.directory, trust)).toMatchObject({
      kind: 'loaded',
      by: 'operator',
    })
    // The entry file itself changed: the operator still vouches for the directory as it is.
    writeFileSync(join(made.directory, 'row.mjs'), "export const version = 'changed'\n")
    expect(await loadVersion(made.directory, trust, async () => 'the module')).toEqual({
      kind: 'loaded',
      by: 'operator',
      digest: hex("export const version = 'v1'\n"),
      module: 'the module',
    })
  })

  it('清单只差一处不对：每一处都单独被拒，不靠别的检查碰巧拦下', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'version-')))
    scratch.push(directory)
    const trust: Trust = { publisherKeys: [], named: [directory] }
    const manifests = [
      'null',
      '{"format":2,"entry":"a","files":{"a":"00"}}',
      '{"format":1,"entry":3,"files":{"3":"00"}}',
      '{"format":1,"entry":"a","files":null}',
      '{"format":1,"entry":"0","files":"abc"}',
      '{"format":1,"entry":"0","files":["00"]}',
      '{"format":1,"entry":"a","files":{"a":"00","b":1}}',
      '{"format":1,"entry":"a","files":{"a":"00","b/../c":"00"}}',
      '{"format":1,"entry":"a","files":{"a":"00","./c":"00"}}',
      '{"format":1,"entry":"a","files":{"a":"00","c//d":"00"}}',
      '{"format":1,"entry":"a","files":{"a":"00","c\\\\d":"00"}}',
    ]
    for (const manifest of manifests) {
      writeFileSync(join(directory, MANIFEST_FILE), manifest)
      expect(await verifyVersion(directory, trust), manifest).toMatchObject({
        kind: 'refused',
        reason: 'manifest-invalid',
      })
    }
    writeFileSync(join(directory, MANIFEST_FILE), '{"format":1,"entry":"a","files":{"a":"00"}}')
    expect(await verifyVersion(directory, trust)).toMatchObject({ kind: 'verified', digest: '00' })
  })

  it('目录里多出来的文件名字里有感叹号：原因里的名字一字不差', async () => {
    const made = version()
    writeFileSync(join(made.directory, 'a!b.txt'), 'stray')
    expect(await verifyVersion(made.directory, publisher(made))).toEqual({
      kind: 'refused',
      reason: 'unlisted-file',
      detail: 'a!b.txt is in the directory and not in the manifest',
    })
  })

  it('没点名、也没有发行方的签名：装不上', async () => {
    const made = version()
    rmSync(join(made.directory, SIGNATURE_FILE))
    const trust: Trust = { publisherKeys: [made.publicKey], named: [join(made.directory, 'lib')] }
    expect(await verifyVersion(made.directory, trust)).toMatchObject({
      kind: 'refused',
      reason: 'signature-missing',
    })
  })

  it('点名按真实路径比：经软链接指到同一个目录也算点了名', async () => {
    const made = version()
    rmSync(join(made.directory, SIGNATURE_FILE))
    const link = `${made.directory}-link`
    symlinkSync(made.directory, link)
    scratch.push(link)
    const trust: Trust = { publisherKeys: [], named: [link] }
    expect(await verifyVersion(made.directory, trust)).toMatchObject({ kind: 'verified' })
  })
})

describe('装入目录里的一个文件：两层共用的那一段', () => {
  it('在目录里并且摘要对：装入', async () => {
    const made = version()
    const loaded = await loadDirectoryFile(
      made.directory,
      'row.mjs',
      bytes =>
        createHash('sha256').update(bytes).digest('hex') === hex("export const version = 'v1'\n"),
    )
    expect(loaded.kind === 'loaded' && loaded.module).toMatchObject({ version: 'v1' })
  })

  it('路径出了目录、摘要对不上、读不到：各有一种拒绝，不装入', async () => {
    const made = version()
    const never = (): Promise<unknown> => Promise.reject(new Error('loaded'))
    expect(await loadDirectoryFile(made.directory, '../x.mjs', () => true, never)).toEqual({
      kind: 'refused',
      reason: 'outside',
    })
    // The directory itself is no file of it.
    expect(await loadDirectoryFile(made.directory, '.', () => true, never)).toEqual({
      kind: 'refused',
      reason: 'outside',
    })
    expect(await loadDirectoryFile(made.directory, 'row.mjs', () => false, never)).toEqual({
      kind: 'refused',
      reason: 'digest-mismatch',
    })
    expect(await loadDirectoryFile(made.directory, 'gone.mjs', () => true, never)).toMatchObject({
      kind: 'refused',
      reason: 'unreadable',
    })
  })
})

describe('来源：拒绝时说的话与边角', () => {
  it('签名文件末尾带换行：照样核得过', async () => {
    const made = version()
    const manifest = readFileSync(join(made.directory, MANIFEST_FILE))
    writeFileSync(
      join(made.directory, SIGNATURE_FILE),
      `${sign(null, manifest, made.privateKey).toString('base64')}\n`,
    )
    expect(await verifyVersion(made.directory, publisher(made))).toMatchObject({
      kind: 'verified',
      by: 'publisher',
    })
  })

  it('公钥里有一把读不成钥匙：它核不过任何签名，别的照常', async () => {
    const made = version()
    const mixed: Trust = { publisherKeys: ['not a key', made.publicKey], named: [] }
    expect(await verifyVersion(made.directory, mixed)).toMatchObject({ kind: 'verified' })
    const broken: Trust = { publisherKeys: ['not a key'], named: [] }
    expect(await verifyVersion(made.directory, broken)).toMatchObject({
      kind: 'refused',
      reason: 'signature-invalid',
    })
  })

  it('目录里的软链接：原因里写的是它的路径', async () => {
    const made = version()
    symlinkSync('/etc/hosts', join(made.directory, 'lib/link'))
    expect(await verifyVersion(made.directory, publisher(made))).toEqual({
      kind: 'refused',
      reason: 'unlisted-file',
      detail: 'lib/link is in the directory and not in the manifest',
    })
  })

  it('没有清单：原因写明读不到哪个文件', async () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'version-')))
    scratch.push(empty)
    expect(await verifyVersion(empty, { publisherKeys: [], named: [] })).toEqual({
      kind: 'refused',
      reason: 'manifest-missing',
      detail: `${MANIFEST_FILE} cannot be read`,
    })
  })

  it('运维者点了名的目录里入口文件不在：装不上，不当成装入了', async () => {
    const made = version()
    rmSync(join(made.directory, 'row.mjs'))
    const trust: Trust = { publisherKeys: [], named: [made.directory] }
    expect(await loadVersion(made.directory, trust, async () => 'the module')).toEqual({
      kind: 'refused',
      reason: 'file-missing',
      detail: 'row.mjs is in the manifest and cannot be read',
    })
  })
})
