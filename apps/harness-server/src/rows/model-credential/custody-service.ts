// The service definition of `modelCredentialCustody`: the model credential binding of the acting
// tenant, in the shape of server-entry's `ModelCredentialCustody` port. The `model-credential` row
// owns the key and is its one provider; the key is in the trusted table, so only the rows that the
// assembly page lists see it (the provider and `server-entry`, which reads it per call).
//
// Why the key is defined here: like `systemActionAuthorization` (R2-D247), the provider and its one
// consumer are rows of this application. The management of a custody is not a member of the Model
// credential service (model-cordis-contract「凭据服务」), and model-host-local has no management
// service of its own. When a member outside this application needs the key, it moves to the
// `./cordis` entry of the member that then owns it, with the same name and shape.
import { type Context, Service } from '@deepseek-ai/cordis'
import type { ModelCredentialCustody } from '@omne-harness/server-entry'

/** @owner apps/harness-server/src/rows/model-credential */
export abstract class ModelCredentialCustodyService
  extends Service
  implements ModelCredentialCustody
{
  static readonly provide = 'modelCredentialCustody'
  constructor(ctx: Context) {
    super(ctx, ModelCredentialCustodyService.provide)
  }
  abstract readonly bind: ModelCredentialCustody['bind']
  abstract readonly unbind: ModelCredentialCustody['unbind']
  abstract readonly describe: ModelCredentialCustody['describe']
}
export const modelCredentialCustodyKey = ModelCredentialCustodyService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelCredentialCustody: ModelCredentialCustodyService
  }
}
