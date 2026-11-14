import type { Context } from '@deepseek-ai/cordis'
import { decodeProviderName, type ProviderName } from '@omne-harness/model-contract'
import type { CredentialPort } from '@omne-harness/model-contract/provider'
import { parseSecretText, type SecretBindingKey, type SecretScope } from '@omne-harness/settings'
import { createSecretVault } from '@omne-harness/settings-local/secrets'
import { serveModelCredential } from '../../src/cordis.ts'
import { createSecretCredentialPort } from '../../src/index.ts'

export function providerName(text: string): ProviderName {
  const decoded = decodeProviderName(text)
  if (!('ok' in decoded)) throw new Error(`invalid provider fixture ${text}`)
  return decoded.ok
}

export const CREDENTIAL_ITEM = 'apiKey'

export function testKeyOf(provider: string) {
  return (scope: SecretScope, item: string): SecretBindingKey => ({
    scope,
    target: { owner: `model-provider/${provider}`, key: item },
    purpose: 'setting',
  })
}

export type TestCredentials<P> = Readonly<{ port: CredentialPort<P>; close(): void }>

export function createTestCredentials<P = unknown>(
  input: Readonly<{ path: string; secret: string; providers: readonly string[] }>,
): TestCredentials<P> {
  const parsed = parseSecretText(input.secret)
  if (!parsed.ok) throw new Error('invalid test secret')
  const created = createSecretVault({
    path: input.path,
    seed: input.providers.map(provider => ({
      key: testKeyOf(provider)({ layer: 'official' }, CREDENTIAL_ITEM),
      secret: parsed.value,
      configuredAt: null,
    })),
  })
  if (created.kind !== 'open') throw new Error(`test vault: ${created.kind}`)
  const { vault } = created
  const port = createSecretCredentialPort<P>({
    custody: vault,
    providers: new Map(
      input.providers.map(provider => [
        providerName(provider),
        { items: [CREDENTIAL_ITEM], official: true, keyOf: testKeyOf(provider) },
      ]),
    ),
  })
  return { port, close: () => vault.close() }
}

export function vaultCredentialPlugin(path: string, secret: string) {
  return {
    name: 'test-credential',
    apply(ctx: Context) {
      const credentials = createTestCredentials({ path, secret, providers: ['openrouter'] })
      serveModelCredential(ctx, credentials.port)
      ctx.effect(() => () => credentials.close(), 'test-credential.vault')
    },
  }
}
