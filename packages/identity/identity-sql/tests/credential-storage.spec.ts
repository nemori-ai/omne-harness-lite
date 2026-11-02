// R4-3: the credential and the login proof never reach the database files, the outcomes or the
// diagnostics. The credential row holds scrypt material that verifies against the credential.
import { readFile, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { openProvider } from './fixtures/provider.ts'
import { identityDomainFile } from './fixtures/storage.ts'

const IDENTIFIER = 'storage-ada'
const CREDENTIAL = 'credential-plaintext-7f3a'

async function bytesOf(path: string): Promise<Buffer> {
  try {
    await stat(path)
  } catch {
    return Buffer.alloc(0)
  }
  return readFile(path)
}

/** A JSON-safe copy of the outcomes. Instants and durations have no JSON form, so they become markers. */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain)
  if (value === null || typeof value !== 'object') return value
  const name = value.constructor?.name
  if (name === 'Instant' || name === 'Duration') return `<${name}>`
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
}

function occurrences(haystack: Buffer, needle: string): number {
  const pattern = Buffer.from(needle, 'utf8')
  let count = 0
  for (let at = haystack.indexOf(pattern); at !== -1; at = haystack.indexOf(pattern, at + 1))
    count += 1
  return count
}

it('stores scrypt material only, and no output quotes the credential or the proof', async () => {
  const opened = await openProvider()
  const outputs: unknown[] = []
  try {
    const registration = await opened.provider.operations.registerAndActivate({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    outputs.push(registration)
    const issued = await opened.provider.operations.issueLogin({
      loginIdentifier: IDENTIFIER,
      credential: CREDENTIAL,
    })
    outputs.push(issued)
    if (issued.kind !== 'succeeded') throw new Error('issue failed')
    const proof = issued.loginProof
    outputs.push(await opened.provider.operations.recognizeLogin({ loginProof: proof }))
    outputs.push(
      await opened.provider.operations.issueLogin({
        loginIdentifier: IDENTIFIER,
        credential: 'credential-wrong',
      }),
    )
    opened.clock.makeUnavailable('clock down')
    outputs.push(await opened.provider.operations.recognizeLogin({ loginProof: proof }))
    outputs.push(
      await opened.provider.operations.issueLogin({
        loginIdentifier: IDENTIFIER,
        credential: CREDENTIAL,
      }),
    )
    opened.clock.restore()
    // Close the storage first, so the files are complete; the provider is stopped by `close`.
    opened.provider.stop()
    await opened.scrypt.module.close()
    await opened.storage.close()

    const file = identityDomainFile(opened.storage.storageRoot)
    const database = await bytesOf(file)
    const wal = await bytesOf(`${file}-wal`)
    const files = Buffer.concat([database, wal])
    const text = JSON.stringify(plain(outputs)).replaceAll(proof, '<the proof itself>')
    // Positive control: the search reaches the rows, and finds a planted plaintext sample.
    expect(occurrences(files, IDENTIFIER)).toBeGreaterThan(0)
    expect(occurrences(Buffer.from(`x${CREDENTIAL}x`), CREDENTIAL)).toBe(1)
    expect(occurrences(files, CREDENTIAL)).toBe(0)
    expect(occurrences(files, proof)).toBe(0)
    expect(text.includes(CREDENTIAL)).toBe(false)
    expect(text.includes('<the proof itself>')).toBe(true)
    expect(text.split('<the proof itself>').length - 1).toBe(1)

    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const row = db
        .prepare(
          'SELECT c.material AS material FROM id_credential c JOIN id_account a ON a.account = c.account WHERE a.login_identifier = ?',
        )
        .get(IDENTIFIER) as { material: string } | undefined
      expect(row?.material.startsWith('$scrypt$v=1$')).toBe(true)
      const { openTestScrypt } = await import('./fixtures/scrypt.ts')
      const checker = await openTestScrypt()
      const admitted = checker.module.verify(row?.material ?? '', CREDENTIAL)
      if (!('done' in admitted)) throw new Error(`verify refused: ${admitted.code}`)
      expect((await admitted.done).code).toBe('match')
      await checker.module.close()
    } finally {
      db.close()
    }
  } finally {
    await opened.close().catch(() => undefined)
  }
})
