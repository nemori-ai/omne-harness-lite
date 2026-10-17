import { existsSync } from 'node:fs'
import { Context, Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import { createLocalCustodian, openLocalCustodian, type LocalCustodian } from './store.ts'
import type {
  CredentialPort,
  CredentialPresence,
  CredentialQuery,
  CredentialResolution,
  SendFace,
} from '@omne-harness/model-contract'

/** @owner packages/model/model */
export class ModelCredentialService extends Service {
  static readonly provide = 'modelCredential'
  private readonly port: CredentialPort

  constructor(ctx: CordisContext, port: CredentialPort) {
    super(ctx, ModelCredentialService.provide)
    this.port = port
  }

  present(reference: CredentialQuery): CredentialPresence {
    return this.port.present(reference)
  }

  resolve(reference: CredentialQuery, face: SendFace): CredentialResolution {
    return this.port.resolve(reference, face)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelCredential?: ModelCredentialService
  }
}

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

  constructor(ctx: Context, config: { readonly path: string; readonly factorySecret: string }) {
    const opened = openPort(config)
    super(ctx, opened.port)
    const custodian = opened.custodian
    if (!custodian) return
    ctx.fiber.effect(() => () => {
      custodian.close()
    })
  }
}
