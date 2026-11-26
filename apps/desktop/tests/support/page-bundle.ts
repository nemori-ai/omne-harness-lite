import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** A key pair of one test: no key is kept in the repository. */
export function publisher(): Readonly<{ publicKey: string; signs(manifest: string): string }> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    signs: manifest => sign(null, Buffer.from(manifest), privateKey).toString('base64'),
  }
}

function filesUnder(directory: string, under = directory): string[] {
  return readdirSync(under, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? filesUnder(directory, join(under, entry.name))
      : [relative(directory, join(under, entry.name)).split('\\').join('/')],
  )
}

/** Writes the manifest of a page bundle over the files that are there, and its signature when a publisher is given. */
export function signBundle(directory: string, signedBy?: ReturnType<typeof publisher>): string {
  const listed = filesUnder(directory).filter(
    path => path !== 'manifest.json' && path !== 'manifest.sig',
  )
  const digest = (path: string): string =>
    createHash('sha256')
      .update(readFileSync(join(directory, path)))
      .digest('hex')
  const files = Object.fromEntries(listed.sort().map(path => [path, digest(path)]))
  const manifest = JSON.stringify({ format: 1, entry: 'index.html', files })
  writeFileSync(join(directory, 'manifest.json'), manifest)
  if (signedBy !== undefined)
    writeFileSync(join(directory, 'manifest.sig'), signedBy.signs(manifest))
  return directory
}

/** A small page bundle: an `index.html` with the mark in it, and the list of protocols it speaks. */
export function smallBundle(
  directory: string,
  mark: string,
  signedBy?: ReturnType<typeof publisher>,
): string {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'index.html'), `<!doctype html><title>${mark}</title>`)
  writeFileSync(join(directory, 'protocols.json'), JSON.stringify([{ name: 'identity', major: 1 }]))
  return signBundle(directory, signedBy)
}
