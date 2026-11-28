import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { providedOn, serveProtocol, startShell } from '@omne-harness/shell-contract/testing'
import { createComposer } from '@omne-harness/slash-command-contract'
import {
  createSlashCommandUiModule,
  slashCommandComposerKey,
} from '@omne-harness/slash-command-ui/cordis'

const slashCommandUiModule = createSlashCommandUiModule({ composer: createComposer })
import { expect, it } from 'vitest'

it('offers the helper of a composer while the command protocol is served, and nothing without it', async () => {
  const bare = await startShell()
  await bare.root.plugin(slashCommandUiModule)
  expect(providedOn(bare.shell, slashCommandComposerKey)).toBeUndefined()
  const { root, shell } = await startShell()
  const client = { 'read-catalog': async () => ({ outcome: 'limited' }), observe: {} }
  const fiber = await serveProtocol(root, slashCommandProtocol, client)
  await root.plugin(slashCommandUiModule)
  const helpers = providedOn(shell, slashCommandComposerKey)
  expect(typeof helpers?.open).toBe('function')
  await fiber.dispose()
  expect(providedOn(shell, slashCommandComposerKey)).toBeUndefined()
})
