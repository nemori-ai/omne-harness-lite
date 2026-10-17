import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { createLocalCustodian, openLocalCustodian, type LocalCustodian } from './store.ts'
import type { CredentialPort } from '@omne-harness/model-contract'

const pathSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'model',
    validate(value: unknown) {
      if (!value || typeof value !== 'object' || !('path' in value)) {
        return { issues: [{ message: 'path is required' }] }
      }
      const path = (value as { path?: unknown; factorySecret?: unknown }).path
      const factorySecret = (value as { factorySecret?: unknown }).factorySecret
      if (typeof path !== 'string' || path.length === 0) {
        return { issues: [{ message: 'path is required' }] }
      }
      if (typeof factorySecret !== 'string') {
        return { issues: [{ message: 'factorySecret is required' }] }
      }
      return { value: { path, factorySecret } }
    },
  },
}

const unavailablePort: CredentialPort = {
  present() {
    return { kind: 'unavailable' }
  },
  resolve() {
    return { kind: 'unavailable' }
  },
}

function openPort(config: { readonly path: string; readonly factorySecret: string }): {
  readonly port: CredentialPort
  readonly custodian?: LocalCustodian
} {
  if (!existsSync(config.path)) {
    const custodian = createLocalCustodian(config.path, config.factorySecret)
    return { port: custodian, custodian }
  }
  const opened = openLocalCustodian(config.path)
  if ('kind' in opened) return { port: unavailablePort }
  return { port: opened, custodian: opened }
}

export class LocalCredentialPlugin extends ModelCredentialService {
  static readonly Config = pathSchema

  readonly present: CredentialPort['present']
  readonly resolve: CredentialPort['resolve']

  constructor(ctx: Context, config: { readonly path: string; readonly factorySecret: string }) {
    super(ctx)
    // The port lives only in these closures. Cordis hands consumers a proxy of the instance, and
    // `#private` fields fail through it, so a closure is the only place that stays out of reach.
    const { port, custodian } = openPort(config)
    this.present = reference => port.present(reference)
    this.resolve = (reference, face) => port.resolve(reference, face)
    if (!custodian) return
    ctx.fiber.effect(() => () => {
      custodian.close()
    })
  }
}
