import { describe, it } from 'vitest'
import { windowBackendOfScene, windowContractCases } from '@omne-harness/screen/testing'
import { macosOverScene } from './fixtures/windows.ts'

describe('the window backend contract on the stand-in over a scene', () => {
  it.each(windowContractCases)('$name', async ({ run }) => {
    await run(windowBackendOfScene)
  })
})

describe('the window backend contract on macOS, over stand-in system calls', () => {
  it.each(windowContractCases)('$name', async ({ run }) => {
    await run(async scene => (await macosOverScene(scene)).backend)
  })
})
