import type { Context } from '@deepseek-ai/cordis'
import { Credentials } from '@omne-harness-lite/account-identity/cordis'
import type { CredentialsService } from '@omne-harness-lite/account-identity'

export class ScryptCredentials extends Credentials {
  readonly parse: CredentialsService['parse']
  readonly derive: CredentialsService['derive']
  readonly verify: CredentialsService['verify']
  readonly checkPolicy: CredentialsService['checkPolicy']
  constructor(ctx: Context, implementation: CredentialsService) {
    super(ctx)
    this.parse = implementation.parse.bind(implementation)
    this.derive = implementation.derive.bind(implementation)
    this.verify = implementation.verify.bind(implementation)
    this.checkPolicy = implementation.checkPolicy.bind(implementation)
  }
}
