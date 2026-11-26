import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { blurMain, deskFigure, liftOut, onDesk, signUp } from './desk.ts'
import { expect, test } from './desktop.ts'

// The desk layer is macOS only in this version (apps/desktop/SPEC.md#桌面层); elsewhere the figure stays in the page.
test.skip(process.platform !== 'darwin', '桌面层这一版只在 macOS 上有，别的系统上形出不了页面')

const COMPANION = '对 Agent 说一句话'
const FIELD = '说一句话'
const SENT = '已发送'

/** The one say note, wherever the shell draws it: over the floating items in the window, beside the figure on the desk. */
const noteIn = (page: Page) => page.locator('.shell-float .omne-say-bubble')
const noteOn = (desk: Page) => desk.locator('.omne-say-bubble')
const fieldOf = (on: Page) => on.getByRole('textbox', { name: FIELD })
const part = (on: Page, selector: string): Promise<string | null> =>
  on.evaluate(`document.querySelector('${selector}')?.getAttribute('data-omne-part') ?? null`)

test('说话笺只有一块：窗口里写半句不发，到桌面上单击形，字在；Escape 再单击，字还在；发出去，字清掉；桌面上写的半句，回窗口里开也在，桌面上的先收', async ({
  launchApp,
}) => {
  test.setTimeout(180_000)
  const { app, page } = await launchApp()
  await signUp(page)
  const half = `窗口里的半句 ${randomUUID().slice(0, 6)}`

  await test.step('在窗口里按随身入口：笺是外壳画的那一块，写半句话不发', async () => {
    await page.getByRole('button', { name: COMPANION }).click()
    await expect(noteIn(page)).toBeVisible({ timeout: 10_000 })
    expect(await part(page, '.shell-float .omne-say-bubble')).toBe('shell.figure.note')
    await expect(page.locator('[data-omne-part="session.companion.panel"]')).toHaveCount(0)
    await fieldOf(page).fill(half)
  })

  const desk = await test.step('把形拖到桌面上：窗口里的笺收起', async () => {
    await liftOut(page)
    const shown = await onDesk(app)
    await expect(noteIn(page)).toHaveCount(0)
    return shown
  })

  await test.step('单击桌面上的形：笺里是那半句话，是同一个部位', async () => {
    await blurMain(app)
    await deskFigure(desk).click()
    await expect(noteOn(desk)).toBeVisible({ timeout: 10_000 })
    expect(await part(desk, '.omne-say-bubble')).toBe('shell.figure.note')
    await expect(fieldOf(desk)).toHaveValue(half)
    await expect(noteIn(page)).toHaveCount(0)
  })

  await test.step('按 Escape 再单击：字还在', async () => {
    await fieldOf(desk).press('Escape')
    await expect(noteOn(desk)).toHaveCount(0, { timeout: 10_000 })
    await deskFigure(desk).click()
    await expect(noteOn(desk)).toBeVisible({ timeout: 10_000 })
    await expect(fieldOf(desk)).toHaveValue(half)
  })

  await test.step('发出去：笺上写受理了，字清掉', async () => {
    await fieldOf(desk).press('Enter')
    await expect(noteOn(desk).locator('.omne-say-line')).toHaveText(SENT, { timeout: 30_000 })
    await expect(fieldOf(desk)).toHaveValue('')
  })

  const other = `桌面上的半句 ${randomUUID().slice(0, 6)}`
  await test.step('在桌面上再写半句不发，回窗口里按随身入口：窗口里的笺里是这半句，桌面上的已经收起', async () => {
    await fieldOf(desk).fill(other)
    await page.getByRole('button', { name: COMPANION }).click()
    await expect(noteIn(page)).toBeVisible({ timeout: 10_000 })
    await expect(fieldOf(page)).toHaveValue(other)
    await expect(noteOn(desk)).toHaveCount(0, { timeout: 10_000 })
  })

  await test.step('在窗口里按 Escape 再按随身入口：字还在', async () => {
    await fieldOf(page).press('Escape')
    await expect(noteIn(page)).toHaveCount(0, { timeout: 10_000 })
    await page.getByRole('button', { name: COMPANION }).click()
    await expect(fieldOf(page)).toHaveValue(other)
  })
})
