import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateHandoffKeyPair, isOk } from '@omne-harness-lite/identity-values'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import type { AcceptanceConfig } from '../../../src/index.ts'

export async function hotupdateDeployment(): Promise<
  AcceptanceConfig & { readonly directory: string }
> {
  const parent = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../tmp/model-request-runtime/hotupdate-verification',
  )
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(join(parent, 'case-'))
  const activation = generateHandoffKeyPair()
  const purge = generateHandoffKeyPair()
  const keys = {
    activationSigning: join(directory, 'activation-private.pem'),
    activationVerification: join(directory, 'activation-public.pem'),
    purgeSigning: join(directory, 'purge-private.pem'),
    purgeVerification: join(directory, 'purge-public.pem'),
    modelReplica: join(directory, 'model-key'),
  }
  for (const [file, bytes] of [
    [keys.activationSigning, activation.privateKeyPem],
    [keys.activationVerification, activation.publicKeyPem],
    [keys.purgeSigning, purge.privateKeyPem],
    [keys.purgeVerification, purge.publicKeyPem],
    [keys.modelReplica, randomBytes(32)],
  ] as const)
    await writeFile(file, bytes, { mode: 0o600, flag: 'wx' })
  const duration = parseOfferTtl(60_000)
  if (!isOk(duration)) throw new Error('invalid fixture retention')
  return {
    directory,
    runId: 'hotupdate-real-providers',
    databaseFile: join(directory, 'db.sqlite'),
    keys,
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: duration.ok },
    governance: {
      invitationTtlDefault: duration.ok,
      affiliationRequestTtlDefault: duration.ok,
      teamCreationKeyRetention: duration.ok,
    },
    officialManifest: { ordinal: 1, entries: [] },
    wait: {
      clockTimeoutMs: 15_000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint()) / 1_000_000,
      sleep: async (ms: number) => {
        await new Promise<void>(resolve => setTimeout(resolve, ms))
      },
    },
  }
}
