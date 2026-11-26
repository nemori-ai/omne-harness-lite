import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from '@playwright/test'
import { blurMain, deskFigure, deskShown, deskWindow, liftOut, recall, signUp } from './desk.ts'
import { expect, test } from './desktop.ts'

// The desk layer is macOS only in this version (apps/desktop/SPEC.md#桌面层); elsewhere the figure stays in the page.
test.skip(process.platform !== 'darwin', '桌面层这一版只在 macOS 上有，别的系统上形出不了页面')

// e2e-sea and e2e-ember draw the figure as a div marked with their name. e2e-broken's drawing throws while it draws:
// an export that throws when called fails the install (packages/plugin/SPEC.md#客户端的装载器), so it could not be worn.
test.use({ pluginsFrom: fileURLToPath(new URL('./fixtures/skins', import.meta.url)) })

const BUILTIN = '自带的样子'
const TOKEN = '--omne-accent'
/** The letter spacing each skin gives the note, as computed. */
const SPACING = { 'e2e-sea': '3px', 'e2e-ember': '5px', 'e2e-broken': '7px' } as const
/** DT-58: the desk layer is at most this much later than the main window. */
const DESK_LAG_MS = 4_000

// In-page expressions: the e2e project has no DOM types, so they are text, as in desk-figure.spec.ts.
const ACCENT = `getComputedStyle(document.documentElement).getPropertyValue('${TOKEN}').trim()`
const SKIN = `document.querySelector('[data-omne-part="shell.figure"] [data-e2e-skin]')?.getAttribute('data-e2e-skin') ?? null`

const accentOf = (on: Page): Promise<string> => on.evaluate(ACCENT)

/** Wears a skin, or the built-in look, where a person does: the skin category of the assets page. */
async function wear(page: Page, choice: keyof typeof SPACING | typeof BUILTIN): Promise<void> {
  await page.getByRole('link', { name: '资产' }).click()
  await page.getByRole('tab', { name: '皮肤' }).click()
  const radio = page.getByRole('radio', { name: choice })
  await expect(radio).toBeEnabled({ timeout: 30_000 })
  await radio.click()
  await expect(page.locator('label.plugin-skin', { has: radio })).toContainText('在用', {
    timeout: 30_000,
  })
}

const figureOn = (desk: Page) =>
  desk.locator('main.desk[data-mode=rest] [data-omne-part="shell.figure"]')
const noteOn = (desk: Page) => desk.locator('[data-omne-part="shell.figure.note"]')

type Look = Readonly<{ skin: string | null; accent: string; spacing: string | null }>

/** The look of the desk layer now: whose drawing the figure is, the token on the root, the note's letter spacing. */
const deskLook = (desk: Page): Promise<Look> =>
  desk.evaluate(`(() => {
    const note = document.querySelector('[data-omne-part="shell.figure.note"]')
    return {
      skin: ${SKIN},
      accent: ${ACCENT},
      spacing: note === null ? null : getComputedStyle(note).letterSpacing,
    }
  })()`)

/** Records, in every animation frame of the desk layer, the figure's skin with the token on the root, until read. */
const sampleFrames = (desk: Page): Promise<void> =>
  desk.evaluate(`(() => {
    const frames = []
    const record = () => {
      frames.push([${SKIN}, ${ACCENT}])
      window.e2eFrame = requestAnimationFrame(record)
    }
    window.e2eFrames = frames
    record()
  })()`)

const framesSampled = (desk: Page): Promise<[string | null, string][]> =>
  desk.evaluate(`(() => {
    cancelAnimationFrame(window.e2eFrame)
    return window.e2eFrames
  })()`)

async function expectBuiltInFigure(desk: Page): Promise<void> {
  await expect(figureOn(desk).locator('[data-e2e-skin]')).toHaveCount(0, { timeout: DESK_LAG_MS })
  await expect(figureOn(desk).locator('.omne-figure-ink canvas')).toHaveCount(1)
}

async function expectAccentFollowsMain(app: ElectronApplication, page: Page, desk: Page) {
  const main = await accentOf(page)
  await expect.poll(() => accentOf(desk), { timeout: DESK_LAG_MS }).toBe(main)
  expect((await deskWindow(app))?.visible).toBe(true)
  return main
}

test('穿着皮肤把形拖出窗口还是皮肤的样子；在窗口里换一套，桌面上整套一起换；脱下回到自带的；画法出错的那一处落回自带的；重新加载主窗口后再拖出去照样', async ({
  launchApp,
}) => {
  test.setTimeout(240_000)
  const { app, page } = await launchApp()
  await signUp(page)
  const builtInAccent = await accentOf(page)
  await wear(page, 'e2e-sea')
  const seaAccent = await accentOf(page)
  expect(seaAccent).not.toBe(builtInAccent)

  const desk =
    await test.step('穿着 e2e-sea 拖出窗口：桌面上的形是 sea 的画法，令牌与主窗口的相同；主窗口的家空着', async () => {
      await liftOut(page)
      const shown = await deskShown(app)
      await expect(figureOn(shown).locator('[data-e2e-skin="sea"]')).toHaveCount(1)
      expect(await accentOf(shown)).toBe(seaAccent)
      await expect(recall(page)).toBeVisible()
      await expect(page.locator('[data-e2e-skin]')).toHaveCount(0)
      await expect(page.locator('.omne-figure-carried .omne-figure-ink')).toHaveCount(0)
      return shown
    })

  await test.step('单击桌面上的形：说话笺带着 e2e-sea 写的样式', async () => {
    await blurMain(app)
    await deskFigure(desk).click()
    await expect(noteOn(desk)).toBeVisible({ timeout: 10_000 })
    expect((await deskLook(desk)).spacing).toBe(SPACING['e2e-sea'])
  })

  await test.step('形留在桌面上，在主窗口里换成 e2e-ember：4 秒内桌面上画法、令牌、笺的样式一起换，没有一帧一半一半', async () => {
    await sampleFrames(desk)
    await wear(page, 'e2e-ember')
    const emberAccent = await accentOf(page)
    expect(emberAccent).not.toBe(seaAccent)
    await expect
      .poll(() => deskLook(desk), { timeout: DESK_LAG_MS })
      .toEqual({ skin: 'ember', accent: emberAccent, spacing: SPACING['e2e-ember'] })
    const frames = await framesSampled(desk)
    const whole = [JSON.stringify(['sea', seaAccent]), JSON.stringify(['ember', emberAccent])]
    expect(
      frames.map(frame => JSON.stringify(frame)).filter(frame => !whole.includes(frame)),
    ).toEqual([])
    expect(frames[0]).toEqual(['sea', seaAccent])
    expect(frames.at(-1)).toEqual(['ember', emberAccent])
  })

  await test.step('回到自带的样子：桌面上的形是墨画的，令牌与笺的样式回到缺省', async () => {
    await wear(page, BUILTIN)
    expect(await expectAccentFollowsMain(app, page, desk)).toBe(builtInAccent)
    await expectBuiltInFigure(desk)
    expect(Object.values(SPACING)).not.toContain((await deskLook(desk)).spacing)
  })

  await test.step('穿 e2e-broken：形的画法抛出，那一处落回墨画的；令牌与笺的样式照皮肤', async () => {
    await wear(page, 'e2e-broken')
    const brokenAccent = await expectAccentFollowsMain(app, page, desk)
    expect([builtInAccent, seaAccent]).not.toContain(brokenAccent)
    await expectBuiltInFigure(desk)
    expect((await deskLook(desk)).spacing).toBe(SPACING['e2e-broken'])
  })

  await test.step('穿回 e2e-sea，重新加载主窗口：形回座位；再拖出去，还是 sea 的画法与令牌', async () => {
    await wear(page, 'e2e-sea')
    await page.reload()
    await expect.poll(async () => (await deskWindow(app))?.visible).toBe(false)
    await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
    await expect(recall(page)).toHaveCount(0)
    expect(await accentOf(page)).toBe(seaAccent)
    await liftOut(page)
    const shown = await deskShown(app)
    await expect(figureOn(shown).locator('[data-e2e-skin="sea"]')).toHaveCount(1)
    expect(await accentOf(shown)).toBe(seaAccent)
  })
})
