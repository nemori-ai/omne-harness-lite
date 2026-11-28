import type { ElectronApplication, Page } from '@playwright/test'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { fileURLToPath } from 'node:url'
import { PASSWORD, signUp } from './desk.ts'
import { expect, test } from './desktop.ts'
import { assetsOf, publish } from './tenant-publish.ts'

// The handbook's example with a page of its own, as a tenant publishes it.
const NOTES_PAGE = fileURLToPath(
  new URL(
    '../../../packages/plugin/plugin-host-local/skills/extending-the-app/examples/notes-page',
    import.meta.url,
  ),
)

type Asked = Readonly<{
  page: string
  theme: 'light' | 'dark'
  size: string
  look: Readonly<{ kind: 'built-in' }> | Readonly<{ kind: 'skin'; name: string }>
  width: number
  height: number
}>
type Looked =
  | Readonly<{ reason: string }>
  | Readonly<{ width: string; height: string; png: string }>

const SETTINGS_DARK: Asked = {
  page: 'settings',
  theme: 'dark',
  size: 'small',
  look: { kind: 'built-in' },
  width: 480,
  height: 720,
}

/** The tenant of a person, as the shell names it. */
async function tenantOf(origin: string, name: string): Promise<string> {
  const identity = createClient(identityProtocol, createHttpProtocolTransport({ origin }))
  const issued = await identity['issue-login']({ loginIdentifier: name, credential: PASSWORD })
  if (issued.outcome !== 'succeeded') throw new Error(`issue-login: ${issued.outcome}`)
  const tenant = tenantCodec.encode(issued.body.tenantId)
  if (!tenant.ok) throw new Error('the tenant does not encode')
  return tenant.value
}

// Strings, not functions: this file is checked without the DOM's types.
const look = (page: Page, asked: unknown): Promise<Looked> =>
  page.evaluate(`(async () => {
    const response = await fetch('/device/view', { method: 'POST', body: ${JSON.stringify(JSON.stringify(asked))} })
    if (response.headers.get('content-type') !== 'image/png') return { reason: (await response.json()).reason }
    let text = ''
    for (const byte of new Uint8Array(await response.arrayBuffer())) text += String.fromCharCode(byte)
    return { width: response.headers.get('x-omne-width'), height: response.headers.get('x-omne-height'), png: btoa(text) }
  })()`)

/** What the person has in front of them, and everything the page keeps on this device. */
const seen = (page: Page): Promise<unknown> =>
  page.evaluate(`(() => {
    const shown = document.querySelector('section.shell-page:not([hidden])')
    const active = document.activeElement
    const box = document.querySelector('textarea')
    const kept = Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])
    return {
      page: shown?.getAttribute('data-page') ?? null,
      scroll: shown?.scrollTop ?? null,
      focus: active === null ? null : active.tagName + ':' + (active.getAttribute('aria-label') ?? ''),
      text: box?.value ?? null,
      selection: box === null ? null : [box.selectionStart, box.selectionEnd],
      theme: document.documentElement.dataset.theme ?? null,
      kept,
    }
  })()`)

const windows = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map(window => ({
      id: window.id,
      visible: window.isVisible(),
      focused: window.isFocused(),
    })),
  )

const memory = (app: ElectronApplication) =>
  app.evaluate(({ app: electron }) =>
    electron.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0),
  )

/** The size of the picture and the brightness of a point near its lower right corner, read the way the app reads images. */
const pixels = (app: ElectronApplication, png: string) =>
  app.evaluate(({ nativeImage }, base64) => {
    const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'))
    const { width, height } = image.getSize()
    const bitmap = image.toBitmap()
    const at = (4 * ((height - 4) * width + (width - 4))) | 0
    return { width, height, brightness: bitmap[at]! + bitmap[at + 1]! + bitmap[at + 2]! }
  }, png)

test('看界面的窗口：人停在对话页留着半句话，截设置页的暗色窄屏；人这边的页、焦点、滚动、字与本机存储都没变，窗口从不出现', async ({
  launchApp,
  server,
}) => {
  const { app, page } = await launchApp()
  const tenant = await tenantOf(server, await signUp(page))
  await page.getByRole('button', { name: '新建会话' }).click()
  const box = page.getByRole('textbox', { name: '输入消息' })
  await box.fill('这句话还没写完')
  await box.press('ArrowLeft')
  const before = await seen(page)
  const windowsBefore = await windows(app)
  expect(before).toMatchObject({
    text: '这句话还没写完',
    focus: expect.stringMatching(/^TEXTAREA:/u),
  })

  let watching = true
  const memoryBefore = await memory(app)
  let memoryMost = memoryBefore
  const during: { visible: number; focusedOthers: number }[] = []
  const watch = (async () => {
    while (watching) {
      const now = await windows(app)
      during.push({
        visible: now.filter(window => window.visible).length,
        focusedOthers: now.filter(
          window => window.focused && !windowsBefore.some(w => w.id === window.id),
        ).length,
      })
      memoryMost = Math.max(memoryMost, await memory(app))
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  })()
  const started = Date.now()
  const dark = await look(page, { ...SETTINGS_DARK, tenant })
  const darkMs = Date.now() - started
  const light = await look(page, { ...SETTINGS_DARK, tenant, theme: 'light' })
  const lightMs = Date.now() - started - darkMs
  watching = false
  await watch
  // The measure the slice asked for first: how long a window takes to bring the whole app up, and what it holds.
  console.log(
    `look-window measure: dark ${String(darkMs)} ms, light ${String(lightMs)} ms, working set ${String(Math.round(memoryBefore / 1024))} MB before, ${String(Math.round(memoryMost / 1024))} MB at most`,
  )

  expect(dark).toMatchObject({ width: '480', height: '720' })
  expect(light).toMatchObject({ width: '480', height: '720' })
  if (!('png' in dark) || !('png' in light)) throw new Error('no picture')
  const darkPixels = await pixels(app, dark.png)
  const lightPixels = await pixels(app, light.png)
  expect([darkPixels.width, darkPixels.height]).toEqual([480, 720])
  expect(darkPixels.brightness).toBeLessThan(3 * 90)
  expect(lightPixels.brightness).toBeGreaterThan(3 * 180)

  expect(during.length).toBeGreaterThan(0)
  expect(Math.max(...during.map(each => each.visible))).toBe(
    windowsBefore.filter(window => window.visible).length,
  )
  expect(during.every(each => each.focusedOthers === 0)).toBe(true)
  expect(await windows(app)).toEqual(windowsBefore)
  expect(await seen(page)).toEqual(before)
})

test('看界面的窗口答得出做不到的原因：没有这一页、没有这套皮肤、模式不对', async ({
  launchApp,
  server,
}) => {
  const { page } = await launchApp()
  const asked = { ...SETTINGS_DARK, tenant: await tenantOf(server, await signUp(page)) }
  expect(await look(page, { ...asked, page: 'no-such-page' })).toEqual({ reason: 'no-page' })
  expect(await look(page, { ...asked, look: { kind: 'skin', name: 'no-such-skin' } })).toEqual({
    reason: 'no-skin',
  })
  expect(await look(page, { ...asked, width: 100 })).toEqual({ reason: 'bad-mode' })
})

test('看界面的窗口看得到这个租户装的 Plugin 带来的页', async ({ launchApp, server }) => {
  const { page } = await launchApp()
  const name = await signUp(page)
  const { tenant, assets } = await assetsOf(server, name)
  await publish(assets, tenant, 'plugin', 'notes-page', NOTES_PAGE)
  await expect(page.locator('a[data-page="notes"]')).toBeVisible({ timeout: 30_000 })
  const looked = await look(page, {
    ...SETTINGS_DARK,
    page: 'notes',
    tenant: await tenantOf(server, name),
  })
  expect('png' in looked, JSON.stringify(looked)).toBe(true)
})
