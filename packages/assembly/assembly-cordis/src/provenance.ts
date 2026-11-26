import { createHash, createPublicKey, verify } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MANIFEST_FILE = 'manifest.json'
export const SIGNATURE_FILE = 'manifest.sig'

export type Trust = Readonly<{ publisherKeys: readonly string[]; named: readonly string[] }>

export type Refusal =
  | 'manifest-missing'
  | 'manifest-invalid'
  | 'signature-missing'
  | 'signature-invalid'
  | 'digest-mismatch'
  | 'file-missing'
  | 'unlisted-file'

export type Refused = Readonly<{ kind: 'refused'; reason: Refusal; detail: string }>

export type Verified =
  | Readonly<{ kind: 'verified'; by: 'publisher' | 'operator'; entry: string; digest: string }>
  | Refused

export type LoadedVersion =
  | Readonly<{ kind: 'loaded'; by: 'publisher' | 'operator'; digest: string; module: unknown }>
  | Refused

export type FileLoad =
  | Readonly<{ kind: 'loaded'; module: unknown }>
  | Readonly<{ kind: 'refused'; reason: 'outside' | 'digest-mismatch' }>
  | Readonly<{ kind: 'refused'; reason: 'unreadable'; cause: unknown }>

type Manifest = Readonly<{ entry: string; files: Readonly<Record<string, string>> }>

const refused = (reason: Refusal, detail: string): Refused => ({ kind: 'refused', reason, detail })

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const importIt = (url: string): Promise<unknown> => import(url)

function within(directory: string, path: string): string | undefined {
  const file = join(directory, ...path.split('/'))
  const inside = relative(directory, file)
  return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? undefined : file
}

/** Loads one file of a directory once it is inside it and its bytes are the expected ones. Both layers load through here. */
export async function loadDirectoryFile(
  directory: string,
  path: string,
  expected: (bytes: Uint8Array) => boolean,
  load: (url: string) => Promise<unknown> = importIt,
): Promise<FileLoad> {
  const file = within(directory, path)
  if (file === undefined) return { kind: 'refused', reason: 'outside' }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readFile(file))
  } catch (cause) {
    return { kind: 'refused', reason: 'unreadable', cause }
  }
  if (!expected(bytes)) return { kind: 'refused', reason: 'digest-mismatch' }
  return { kind: 'loaded', module: await load(pathToFileURL(file).href) }
}

const plain = (path: string): boolean =>
  !path.includes('\\') &&
  path.split('/').every(part => part !== '' && part !== '.' && part !== '..')

function manifestOf(text: string): Manifest | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const { format, entry, files } = parsed as Record<string, unknown>
  if (format !== 1 || typeof entry !== 'string') return undefined
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return undefined
  const listed = Object.entries(files)
  if (listed.some(([, digest]) => typeof digest !== 'string')) return undefined
  if (listed.some(([path]) => !plain(path))) return undefined
  return { entry, files: files as Record<string, string> }
}

function signedBy(keys: readonly string[], manifest: Uint8Array, signature: string): boolean {
  const given = Buffer.from(signature.trim(), 'base64')
  return keys.some(key => {
    try {
      return verify(null, manifest, createPublicKey(key), given)
    } catch {
      return false
    }
  })
}

/** What is no regular file is named with a `!`: it is never listed, so the directory is refused. */
async function filesOf(directory: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (at: string): Promise<void> => {
    for (const name of (await readdir(at)).sort()) {
      const file = join(at, name)
      const stat = await lstat(file)
      const path = relative(directory, file).split(sep).join('/')
      if (stat.isDirectory()) await walk(file)
      else found.push(stat.isFile() ? path : `!${path}`)
    }
  }
  await walk(directory)
  return found
}

async function matches(directory: string, manifest: Manifest): Promise<Refused | undefined> {
  const present = (await filesOf(directory)).filter(
    path => path !== MANIFEST_FILE && path !== SIGNATURE_FILE,
  )
  const stray = present.find(path => !Object.hasOwn(manifest.files, path))
  if (stray !== undefined)
    return refused(
      'unlisted-file',
      `${stray.replace(/^!/u, '')} is in the directory and not in the manifest`,
    )
  for (const [path, digest] of Object.entries(manifest.files)) {
    if (!present.includes(path))
      return refused('file-missing', `${path} is in the manifest and not in the directory`)
    if (sha256(await readFile(join(directory, ...path.split('/')))) !== digest)
      return refused('digest-mismatch', `${path} does not match its digest in the manifest`)
  }
  return undefined
}

async function named(directory: string, trust: Trust): Promise<boolean> {
  const real = await realpath(directory)
  for (const each of trust.named)
    if ((await realpath(each).catch(() => undefined)) === real) return true
  return false
}

/** A directory the operator named is taken as it is; any other needs the publisher's signature and every file as listed. */
export async function verifyVersion(directory: string, trust: Trust): Promise<Verified> {
  const text = await readFile(join(directory, MANIFEST_FILE)).catch(() => undefined)
  if (text === undefined) return refused('manifest-missing', `${MANIFEST_FILE} cannot be read`)
  const manifest = manifestOf(text.toString('utf8'))
  if (manifest === undefined || !Object.hasOwn(manifest.files, manifest.entry))
    return refused('manifest-invalid', `${MANIFEST_FILE} is not a manifest of format 1`)
  const verified = { kind: 'verified', entry: manifest.entry } as const
  if (await named(directory, trust))
    return { ...verified, by: 'operator', digest: manifest.files[manifest.entry] ?? '' }
  const signature = await readFile(join(directory, SIGNATURE_FILE), 'utf8').catch(() => undefined)
  if (signature === undefined)
    return refused(
      'signature-missing',
      `${SIGNATURE_FILE} cannot be read and the operator did not name the directory`,
    )
  if (!signedBy(trust.publisherKeys, text, signature))
    return refused(
      'signature-invalid',
      'no key of the publisher verifies the signature of the manifest',
    )
  const mismatch = await matches(directory, manifest)
  if (mismatch !== undefined) return mismatch
  return { ...verified, by: 'publisher', digest: manifest.files[manifest.entry] ?? '' }
}

export async function loadVersion(
  directory: string,
  trust: Trust,
  load: (url: string) => Promise<unknown> = importIt,
): Promise<LoadedVersion> {
  const verified = await verifyVersion(directory, trust)
  if (verified.kind === 'refused') return verified
  const { by, entry, digest } = verified
  const expected = (bytes: Uint8Array): boolean => by === 'operator' || sha256(bytes) === digest
  const loaded = await loadDirectoryFile(directory, entry, expected, load)
  if (loaded.kind === 'loaded') return { kind: 'loaded', by, digest, module: loaded.module }
  return loaded.reason === 'digest-mismatch'
    ? refused('digest-mismatch', `${entry} does not match its digest in the manifest`)
    : refused('file-missing', `${entry} is in the manifest and cannot be read`)
}
