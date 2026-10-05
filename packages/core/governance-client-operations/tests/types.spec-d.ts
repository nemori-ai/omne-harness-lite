import { expectTypeOf, test } from 'vitest'
import {
  exitStatus,
  type ActionIntent,
  type ActionReport,
  type GovernanceClientOperations,
} from '../src/index.ts'

test('public intent omits credential slots while reports keep the original exit-code domain', () => {
  const login: ActionIntent = { action: 'login', payload: { loginIdentifier: 'example' } }
  void login
  // @ts-expect-error the prepared login intent does not carry its secret
  const secretIntent: ActionIntent = {
    action: 'login',
    payload: { loginIdentifier: 'example', credential: 'secret' },
  }
  void secretIntent
  expectTypeOf(exitStatus).toEqualTypeOf<(report: ActionReport) => 0 | 2 | 3 | 4 | 5 | 70>()
  expectTypeOf<GovernanceClientOperations['runAction']>().toEqualTypeOf<
    (input: unknown) => Promise<ActionReport>
  >()
})
