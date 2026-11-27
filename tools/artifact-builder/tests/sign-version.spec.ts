import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadVersion,
  MANIFEST_FILE,
  SIGNATURE_FILE,
  verifyVersion,
} from '@omne-harness/assembly-cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { signVersion, versionManifestFile, versionSignatureFile } from '../src/index.ts'

const scratch: string[] = []
afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A key pair of this test only: no key is kept in the repository. */
function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

function directory(): string {
  const made = realpathSync(mkdtempSync(join(tmpdir(), 'sign-version-')))
  scratch.push(made)
  mkdirSync(join(made, 'lib'))
  writeFileSync(join(made, 'row.mjs'), "export const version = 'v1'\n")
  writeFileSync(join(made, 'lib', 'part.mjs'), 'export const part = 1\n')
  return made
}

describe('signing a version directory', () => {
  it('writes the two files the deployment reads, under the names it reads them by', () => {
    expect([versionManifestFile, versionSignatureFile]).toEqual([MANIFEST_FILE, SIGNATURE_FILE])
  })

  it('a signed directory is one the deployment takes from that publisher, and loads', async () => {
    const made = directory()
    const { publicKey, privateKey } = keys()
    await signVersion(made, { entry: 'row.mjs', privateKey })
    const trust = { publisherKeys: [publicKey], named: [] }
    expect(await verifyVersion(made, trust)).toMatchObject({
      kind: 'verified',
      by: 'publisher',
      entry: 'row.mjs',
    })
    expect(await loadVersion(made, trust)).toMatchObject({
      kind: 'loaded',
      module: { version: 'v1' },
    })
  })

  it('a file changed after the signing is refused by name; signing again takes it', async () => {
    const made = directory()
    const { publicKey, privateKey } = keys()
    await signVersion(made, { entry: 'row.mjs', privateKey })
    writeFileSync(join(made, 'lib', 'part.mjs'), 'export const part = 2\n')
    const trust = { publisherKeys: [publicKey], named: [] }
    expect(await verifyVersion(made, trust)).toEqual({
      kind: 'refused',
      reason: 'digest-mismatch',
      detail: 'lib/part.mjs does not match its digest in the manifest',
    })
    await signVersion(made, { entry: 'row.mjs', privateKey })
    expect(await verifyVersion(made, trust)).toMatchObject({ kind: 'verified' })
  })

  it('another publisher does not verify it', async () => {
    const made = directory()
    await signVersion(made, { entry: 'row.mjs', privateKey: keys().privateKey })
    expect(
      await verifyVersion(made, { publisherKeys: [keys().publicKey], named: [] }),
    ).toMatchObject({ kind: 'refused', reason: 'signature-invalid' })
  })

  it('refuses a directory with a link, and an entry that is no file of it', async () => {
    const made = directory()
    const { privateKey } = keys()
    await expect(signVersion(made, { entry: 'gone.mjs', privateKey })).rejects.toThrow(
      'version-entry-not-a-file',
    )
    symlinkSync('part.mjs', join(made, 'lib', 'link.mjs'))
    await expect(signVersion(made, { entry: 'row.mjs', privateKey })).rejects.toThrow(
      'version-directory-has-link',
    )
  })
})
