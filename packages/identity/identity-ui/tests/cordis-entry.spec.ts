import { expect, it } from 'vitest'

it('Cordis 入口给出界面模块、部位与账号偏好的口', async () => {
  const cordis = (await import('@omne-harness/identity-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'accountPreferencesKey',
    'identityParts',
    'identityUiModule',
  ])
  expect(cordis['identityUiModule']).toMatchObject({ name: 'identity-ui' })
  expect(cordis['accountPreferencesKey']).toBe('identity.account-preferences')
})
