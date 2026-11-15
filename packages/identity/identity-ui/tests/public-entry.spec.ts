import { expect, it } from 'vitest'

it('根入口只给出两个模型、它们的文案与租户的文本', async () => {
  const root = (await import('@omne-harness/identity-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'FAILED_TEXT',
    'LOGIN_TEXT',
    'createAccountModel',
    'createLoginModel',
    'registerText',
    'tenantText',
  ])
})
