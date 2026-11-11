import { expect, it } from 'vitest'
import { defineSettings } from '@omne-harness/settings'
import {
  definePermission,
  evaluatePermission,
  projectPermissionSettings,
} from '@omne-harness/permissions'
import { definition, evaluation } from './fixtures.ts'

it('declares a real permission, projects valid readable Settings, and evaluates bound material', () => {
  const declared = definePermission(definition())
  expect(declared.kind).toBe('defined')
  if (declared.kind !== 'defined') throw new Error('declaration failed')
  expect(Object.isFrozen(declared.definition.values)).toBe(true)
  const projection = projectPermissionSettings(definition())
  expect(projection.kind).toBe('projected')
  if (projection.kind !== 'projected') throw new Error('projection failed')
  expect(defineSettings(projection.definition).kind).toBe('defined')
  expect(projection.definition.items[0]?.presentation.impact).toBe('允许匹配范围内的命令启动')
  expect(evaluatePermission(evaluation())).toMatchObject({
    kind: 'effective',
    value: 'auto',
    allowedSet: ['deny', 'ask', 'auto'],
  })
})
