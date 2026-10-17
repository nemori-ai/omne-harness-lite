import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import type { CredentialPort } from '@omne-harness/model-contract'

/**
 * The credential seam. `resolve` does not check who calls it: `face` and the tenant in the
 * reference are reported by the caller, so assembly must hand this service only to a trusted send
 * boundary. An implementation must not keep its port or custodian on the instance: every property
 * of the instance is reachable by any plugin that can read `ctx.modelCredential`.
 * @owner packages/model/model-cordis-contract
 */
export abstract class ModelCredentialService extends Service implements CredentialPort {
  static readonly provide = 'modelCredential'

  constructor(ctx: CordisContext) {
    super(ctx, ModelCredentialService.provide)
  }

  abstract readonly present: CredentialPort['present']
  abstract readonly resolve: CredentialPort['resolve']
}
export const modelCredentialKey = ModelCredentialService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelCredential?: ModelCredentialService
  }
}
