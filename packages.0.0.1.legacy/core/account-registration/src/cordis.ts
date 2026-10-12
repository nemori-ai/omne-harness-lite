import { Service, type Context } from '@deepseek-ai/cordis'
import type { RegistrationService } from './index.ts'

/** @contract composition.account-registration */
export abstract class Registration extends Service implements RegistrationService {
  static readonly provide = 'registration' as const
  constructor(ctx: Context) {
    super(ctx, Registration.provide)
  }
  abstract register: RegistrationService['register']
  abstract purgeExpired: RegistrationService['purgeExpired']
}

export const REGISTRATION_SERVICE = Registration.provide
declare module '@deepseek-ai/cordis' {
  interface Context {
    registration: Registration
  }
}
