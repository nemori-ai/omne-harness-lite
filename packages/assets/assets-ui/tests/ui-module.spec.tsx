// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { serviceOf } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { assetGovernanceKey, assetsUiModule, type AssetGovernance } from '../src/cordis.tsx'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SERVICE = protocolServiceName({ name: assetsProtocol.name, major: assetsProtocol.major })

beforeAll(stubAnimation)

afterEach(cleanup)

const pageIds = (root: Context) =>
  (root.shell as unknown as { items(slot: 'pages'): { id: string }[] })
    .items('pages')
    .map(item => item.id)

it('U1 the assets protocol client present: the assets page and then the settings page, both after the decisions page', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(assetsUiModule)
  const [assets, settings] = shell.items('pages')
  expect(assets).toMatchObject({ id: 'assets', title: '资产', order: 15 })
  expect(settings).toMatchObject({ id: 'settings', title: '设置', order: 20 })
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('gate')).toEqual([])
})

it('U2 the page reads the settings of the scope the shell gives, through the injected client', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(assetsUiModule)
  const page = shell.items('pages')[0]!
  render(<>{page.render({ scope: TENANT })}</>)
  const call = await fake.next('list-settings')
  expect(call.body).toMatchObject({})
  await act(async () => {
    call.answer({ outcome: 'succeeded', body: { items: [], next: null, completeness: 'complete' } })
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})

it('U3 no scope yet: nothing is drawn and no call is made', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(assetsUiModule)
  const page = shell.items('pages')[0]!
  const view = render(<>{page.render({ scope: undefined })}</>)
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(fake.calls).toHaveLength(0)
  expect(view.container.textContent).toBe('')
})

it('U4 the protocol client withdrawn: the module unloads and its page is removed; back again: placed again', async () => {
  const { root } = await startShell()
  const fake = createFakeClient()
  const unprovide = root.reflect.provide(SERVICE, fake.client)
  await root.plugin(assetsUiModule)
  expect(pageIds(root)).toEqual(['assets', 'settings'])
  unprovide()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(pageIds(root)).toEqual([])
  root.reflect.provide(SERVICE, fake.client)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(pageIds(root)).toEqual(['assets', 'settings'])
})

it('U6 the module provides the governance port: another module injects it, reads one category through it, and loses it with the module', async () => {
  const { root } = await startShell()
  const fake = createFakeClient()
  const unprovide = root.reflect.provide(SERVICE, fake.client)
  await root.plugin(assetsUiModule)
  const seen: AssetGovernance[] = []
  await root.plugin(
    defineUiModule({
      name: 'category-ui',
      inject: [assetGovernanceKey],
      apply(_shell, services) {
        seen.push(serviceOf(services, assetGovernanceKey))
      },
    }),
  )
  expect(seen).toHaveLength(1)
  const mcp = seen[0]!.open(TENANT, 'mcp')
  expect(mcp.getSnapshot()).toEqual({ kind: 'reading' })
  expect((await fake.next('list-settings')).body).toMatchObject({ tenant: TENANT })
  mcp.close()
  expect(typeof seen[0]!.SettingRow).toBe('function')
  const lookup = root as unknown as { get(name: string): unknown }
  unprovide()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(lookup.get(assetGovernanceKey)).toBeUndefined()
})

it('U5 without the protocol client the module does not load', async () => {
  const { root } = await startShell()
  await root.plugin(assetsUiModule)
  expect(pageIds(root)).toEqual([])
})
