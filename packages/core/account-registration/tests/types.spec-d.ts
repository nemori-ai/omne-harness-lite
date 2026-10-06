import { describe, expectTypeOf, it } from 'vitest'
import type {
  PurgeExpiredResult,
  PurgeFailureClass,
  RegistrationDefectRecord,
  RegistrationService,
  TerminalOutcome,
} from '../src/index.ts'

describe('account-registration 类型闭合', () => {
  it('S-5 终结结果恰四值', () => {
    expectTypeOf<TerminalOutcome>().toEqualTypeOf<
      'registered' | 'identifier-taken' | 'credential-rejected' | 'interrupted'
    >()
  })
  it('S-34 三分类', () => {
    expectTypeOf<PurgeFailureClass>().toEqualTypeOf<'terminal' | 'defect' | 'transient'>()
  })
  it('清除链失败值原样带出，两套拼法不翻译', () => {
    type Carried = Extract<PurgeExpiredResult, { failure: string }>['failure']
    expectTypeOf<Carried>().toEqualTypeOf<
      | 'organizationIsNotPersonal'
      | 'accountIsActivated'
      | 'accountNotExpired'
      | 'accountDoesNotExist'
      | 'invalidInput'
      | 'unavailable'
      | 'not-expired'
      | 'purge-warrant-invalid'
      | 'invalid-input'
      | 'storage-unavailable'
    >()
  })
  it('服务面恰两个方法', () => {
    expectTypeOf<keyof RegistrationService>().toEqualTypeOf<'register' | 'purgeExpired'>()
  })
  it('register 的返回恰是四值终结结果（没有 identifier-held-by-expired-record 这类参与方值透出）', () => {
    expectTypeOf<
      Awaited<ReturnType<RegistrationService['register']>>
    >().toEqualTypeOf<TerminalOutcome>()
  })
  it('缺陷记录三类、五个步骤位置', () => {
    expectTypeOf<RegistrationDefectRecord['kind']>().toEqualTypeOf<
      'composition-defect' | 'entry-defect' | 'contract-violation'
    >()
    expectTypeOf<RegistrationDefectRecord['step']>().toEqualTypeOf<
      1 | 2 | 3 | 'purge-1' | 'purge-2'
    >()
  })
})
