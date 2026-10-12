import type { Context } from '@deepseek-ai/cordis'
import { Registration } from '@omne-harness-lite/account-registration/cordis'
import type { RegistrationService } from '@omne-harness-lite/account-registration'

export class SequentialRegistration extends Registration {
  readonly register: RegistrationService['register']
  readonly purgeExpired: RegistrationService['purgeExpired']
  constructor(ctx: Context, implementation: RegistrationService) {
    super(ctx)
    this.register = implementation.register.bind(implementation)
    this.purgeExpired = implementation.purgeExpired.bind(implementation)
  }
}
