import { Context } from '@deepseek-ai/cordis'
import { IdentityOperationsService, identityOperationsKey } from '@omne-harness/identity/cordis'
import {
  inProcessIdentityOperations,
  type IdentityContractProviderOptions,
} from '@omne-harness/identity/testing'

export async function installOperations(options: IdentityContractProviderOptions) {
  const delegate = inProcessIdentityOperations(options)
  class Operations extends IdentityOperationsService {
    readonly registerAndActivate = delegate.registerAndActivate
    readonly issueLogin = delegate.issueLogin
    readonly recognizeLogin = delegate.recognizeLogin
  }
  const ctx = new Context()
  const fiber = await ctx.plugin(Operations)
  const operations = ctx.get(identityOperationsKey)
  if (operations === undefined) {
    await fiber.dispose()
    throw new Error('identity operations not registered')
  }
  return { ctx, operations, dispose: () => fiber.dispose() }
}
