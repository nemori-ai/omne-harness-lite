import { expect, test } from 'vitest'
import {
  toolEnvironmentPermissionDeclaration,
  ENVIRONMENT_PERMISSION_VALUES,
  type ToolDefinition,
} from '../src/index.ts'
const plain: ToolDefinition = {
  name: 'plain',
  description: 'test',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: { type: 'object' },
  permissions: { execute: { default: 'ask' } },
}
const withEnvironment: ToolDefinition = {
  ...plain,
  settings: {
    targetEnvironment: {
      category: 'placement_identity',
      default: { bindingLayer: 'session_sandbox', facilities: ['command', 'files'] },
    },
  },
}

test('environment permission declaration requires an explicit factory value and is absent without an environment dependency', () => {
  for (const value of ENVIRONMENT_PERMISSION_VALUES) {
    expect(toolEnvironmentPermissionDeclaration(plain, value)).toEqual({ kind: 'notApplicable' })
    expect(toolEnvironmentPermissionDeclaration(withEnvironment, value)).toEqual({
      kind: 'declaration',
      declaration: {
        item: 'executionEnvironment',
        kind: 'permission',
        domain: { kind: 'enum', values: ENVIRONMENT_PERMISSION_VALUES },
        default: value,
      },
    })
  }
  // @ts-expect-error Negative input: runtime does not infer a missing default.
  expect(toolEnvironmentPermissionDeclaration(withEnvironment)).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  // @ts-expect-error The action permission value is not an environment permission.
  expect(toolEnvironmentPermissionDeclaration(withEnvironment, 'ask')).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(plain.permissions.execute.default).toBe('ask')
})
