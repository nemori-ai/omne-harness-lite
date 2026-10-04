import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { AccountIdentityConfigSchema } from '@omne-harness-lite/account-identity-sql'
import { AccountRegistrationConfigSchema } from '@omne-harness-lite/account-registration-sequential'
import { CredentialVerificationConfig } from '@omne-harness-lite/credential-verification-scrypt'
import {
  isOk,
  issueHandoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  parseAccountId,
  verifyHandoffWarrant,
} from '@omne-harness-lite/identity-values'
import { ModelProfileDirectoryConfigSchema } from '@omne-harness-lite/model-profile-directory/plugin'
import { OrganizationGovernanceConfigSchema } from '@omne-harness-lite/organization-governance-sql'
import type { AcceptanceConfig } from './types.ts'

async function readOwnedFile(path: string, modelKey = false): Promise<Buffer> {
  if (!isAbsolute(path)) throw new Error('acceptance key path invalid')
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (
      !before.isFile() ||
      (before.mode & 0o777) !== 0o600 ||
      before.uid !== process.getuid?.() ||
      (modelKey && before.size !== 32)
    )
      throw new Error('acceptance key file invalid')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (
      !after.isFile() ||
      (after.mode & 0o777) !== 0o600 ||
      after.uid !== before.uid ||
      after.size !== before.size ||
      (modelKey && bytes.length !== 32)
    ) {
      bytes.fill(0)
      throw new Error('acceptance key file changed')
    }
    return bytes
  } finally {
    await handle.close()
  }
}

export async function prepare(config: AcceptanceConfig) {
  if (
    typeof config.runId !== 'string' ||
    config.runId.length === 0 ||
    !isAbsolute(config.databaseFile) ||
    !Number.isFinite(config.wait.clockTimeoutMs) ||
    config.wait.clockTimeoutMs <= 0 ||
    !Number.isFinite(config.wait.pollMs) ||
    config.wait.pollMs <= 0 ||
    typeof config.wait.monotonicNow !== 'function' ||
    typeof config.wait.sleep !== 'function'
  )
    throw new Error('acceptance static configuration invalid')
  const owner = process.getuid?.()
  const parent = await lstat(dirname(config.databaseFile))
  if (
    owner === undefined ||
    !parent.isDirectory() ||
    parent.uid !== owner ||
    (parent.mode & 0o777) !== 0o700
  )
    throw new Error('acceptance database directory invalid')
  let databaseIdentity:
    { readonly dev: bigint; readonly ino: bigint; readonly birthtimeNs: bigint } | undefined
  try {
    const existing = await lstat(config.databaseFile, { bigint: true })
    if (!existing.isFile() || existing.uid !== BigInt(owner) || (existing.mode & 0o777n) !== 0o600n)
      throw new Error('acceptance database file invalid')
    databaseIdentity = { dev: existing.dev, ino: existing.ino, birthtimeNs: existing.birthtimeNs }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  for (const field of ['cost', 'blockSize', 'parallelization', 'saltBytes', 'keyBytes'])
    if (!Object.hasOwn(config.credentials, field))
      throw new Error('acceptance credential parameters must be explicit')
  const buffers: Buffer[] = []
  try {
    for (const path of [
      config.keys.activationSigning,
      config.keys.activationVerification,
      config.keys.purgeSigning,
      config.keys.purgeVerification,
    ])
      buffers.push(await readOwnedFile(path))
    const [activationSigning, activationVerification, purgeSigning, purgeVerification] =
      buffers.map(bytes => bytes.toString('utf8'))
    if (
      activationSigning === undefined ||
      activationVerification === undefined ||
      purgeSigning === undefined ||
      purgeVerification === undefined
    )
      throw new Error('acceptance deployment keys missing')
    const probe = parseAccountId('model-request-acceptance-key-pairing')
    if (!isOk(probe)) throw new Error('acceptance key probe invalid')
    for (const pair of [
      {
        signing: activationSigning,
        verification: activationVerification,
        purpose: 'activation' as const,
      },
      { signing: purgeSigning, verification: purgeVerification, purpose: 'purge' as const },
    ]) {
      const signing = loadSigningKey(pair.signing),
        verification = loadVerificationKey(pair.verification)
      if (
        !isOk(signing) ||
        !isOk(verification) ||
        verifyHandoffWarrant(
          verification.ok,
          pair.purpose,
          probe.ok,
          issueHandoffWarrant(signing.ok, pair.purpose, probe.ok),
        ) !== 'ok'
      )
        throw new Error('acceptance deployment keys do not match')
    }
    const modelKey = await readOwnedFile(config.keys.modelReplica, true)
    modelKey.fill(0)
    const credentials = CredentialVerificationConfig.parse(config.credentials)
    const identity = AccountIdentityConfigSchema.parse({
      ...config.identity,
      activationVerificationKeyPem: activationVerification,
      purgeVerificationKeyPem: purgeVerification,
    })
    const governance = OrganizationGovernanceConfigSchema.parse({
      ...config.governance,
      purgeSigningKeyPem: purgeSigning,
    })
    const registration = AccountRegistrationConfigSchema.parse({
      activationSigningKeyPem: activationSigning,
    })
    const directory = ModelProfileDirectoryConfigSchema.parse({
      faceMode: 'management',
      officialManifest: config.officialManifest,
    })
    return { credentials, identity, governance, registration, directory, databaseIdentity }
  } finally {
    for (const bytes of buffers) bytes.fill(0)
  }
}
