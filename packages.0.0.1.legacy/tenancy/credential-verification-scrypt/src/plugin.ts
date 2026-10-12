import type { Context } from '@deepseek-ai/cordis'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { CredentialVerificationConfig } from './config.ts'
import { createPasswordCredentials } from './service.ts'
import { ScryptCredentials } from './provided-services.ts'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import { CREDENTIALS_SERVICE } from '@omne-harness-lite/account-identity/cordis'

function describeAssembly(value: unknown): AssemblyDeclaration {
  const config = CredentialVerificationConfig.parse(value)
  return {
    provides: [CREDENTIALS_SERVICE],
    requires: [],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [{ name: 'tenancy-host/credentials', version: 1, config }],
  }
}

function bind(
  ctx: Context,
  config: CredentialVerificationConfig,
  own: (close: () => Promise<void>) => void,
): void {
  const implementation = createPasswordCredentials(config)
  const inFlight = new Set<Promise<unknown>>()
  let live = true
  let closing: Promise<void> | undefined
  const assertLive = (): void => {
    if (!live) throw new Error('Credential provider has stopped')
  }
  const track = <T>(work: () => Promise<T>): Promise<T> => {
    if (!live) return Promise.reject(new Error('Credential provider has stopped'))
    const { promise: job, resolve, reject } = Promise.withResolvers<T>()
    inFlight.add(job)
    job.then(
      () => inFlight.delete(job),
      () => inFlight.delete(job),
    )
    try {
      resolve(work())
    } catch (error) {
      reject(error)
    }
    return job
  }
  own(() => {
    live = false
    closing ??= Promise.allSettled([...inFlight]).then(() => undefined)
    return closing
  })
  new ScryptCredentials(ctx, {
    parse: value => {
      assertLive()
      return implementation.parse(value)
    },
    checkPolicy: (value, policy) => {
      assertLive()
      return implementation.checkPolicy(value, policy)
    },
    derive: value => track(() => implementation.derive(value)),
    verify: (material, value) => track(() => implementation.verify(material, value)),
  })
}

export const credentialsPlugin = definePlugin<CredentialVerificationConfig>({
  name: 'credential-verification-scrypt',
  Config: CredentialVerificationConfig,
  apply(ctx: Context, config) {
    bind(ctx, config, close => {
      ctx.effect(() => close)
    })
  },
})

export const managedCredentialsPlugin = Object.assign(
  definePlugin<CredentialVerificationConfig>({
    name: 'credential-verification-scrypt-managed',
    inject: [ASSEMBLY_LIFETIME_SERVICE],
    Config: CredentialVerificationConfig,
    apply(ctx: Context, config) {
      let closeWork: (() => Promise<void>) | undefined
      startAssemblyWork(
        ctx,
        async () => {
          bind(ctx, config, close => {
            closeWork = close
          })
        },
        async () => {
          await closeWork?.()
        },
      )
    },
  }),
  { assemblyLifecycle: 1 as const, describeAssembly },
)
