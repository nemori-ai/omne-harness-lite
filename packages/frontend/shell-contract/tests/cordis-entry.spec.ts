import { expect, it } from 'vitest'
import { ShellService } from '@omne-harness/shell-contract/cordis'

it('exports the shell service, its key and the module helper', async () => {
  const cordis = (await import('@omne-harness/shell-contract/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(['ShellService', 'defineUiModule', 'shellKey'])
  expect(ShellService.provide).toBe('shell')
  expect(cordis['shellKey']).toBe('shell')
})
