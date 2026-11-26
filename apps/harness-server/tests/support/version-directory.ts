import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MANIFEST_FILE, SIGNATURE_FILE } from '@omne-harness/assembly-cordis'

/** A key pair of one test: no key is kept in the repository. */
export function publisher(): Readonly<{ publicKey: string; signs(manifest: string): string }> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    signs: manifest => sign(null, Buffer.from(manifest), privateKey).toString('base64'),
  }
}

/** Writes a version directory whose entry file is `row.mjs`; signed when a publisher is given. */
export function versionDirectory(
  rowModule: string,
  signedBy?: ReturnType<typeof publisher>,
  under: string = tmpdir(),
): string {
  mkdirSync(under, { recursive: true })
  const directory = realpathSync(mkdtempSync(join(under, 'version-')))
  writeFileSync(join(directory, 'row.mjs'), rowModule)
  const manifest = JSON.stringify({
    format: 1,
    entry: 'row.mjs',
    files: { 'row.mjs': createHash('sha256').update(rowModule).digest('hex') },
  })
  writeFileSync(join(directory, MANIFEST_FILE), manifest)
  if (signedBy !== undefined)
    writeFileSync(join(directory, SIGNATURE_FILE), signedBy.signs(manifest))
  return directory
}

type RowModule = Readonly<{
  row: string
  /** What the generation pushes to `globalThis.__swapLog` when it applies; it pushes `<mark>:gone` when it leaves. */
  mark: string
  provides?: readonly string[]
  injects?: readonly string[]
  swap?: string
  contracts?: Readonly<Record<string, string>>
  /** JavaScript run in `apply(ctx)`, after the mark. */
  body?: string
}>

/** The text of an entry file: a row whose generations tell a test what they did through a global. */
export function rowModule(input: RowModule): string {
  const declaration = {
    row: input.row,
    provides: input.provides ?? [],
    injects: input.injects ?? [],
    ...(input.swap === undefined ? {} : { swap: input.swap }),
    ...(input.contracts === undefined ? {} : { contracts: input.contracts }),
  }
  return `export function row() {
  return {
    declaration: ${JSON.stringify(declaration)},
    plugin: {
      inject: ${JSON.stringify(declaration.injects)},
      apply(ctx) {
        const log = (globalThis.__swapLog ??= [])
        log.push(${JSON.stringify(input.mark)})
        ctx.effect(() => () => void log.push(${JSON.stringify(`${input.mark}:gone`)}))
        ${input.body ?? ''}
      },
    },
  }
}
`
}
