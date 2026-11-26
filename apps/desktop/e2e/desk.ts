import { randomUUID } from 'node:crypto'
import type { ElectronApplication, Page } from '@playwright/test'
import { expect } from './desktop.ts'

const PASSWORD = 'alice-pw-e2e'
const RECALL = '叫它回来'

export async function signUp(page: Page): Promise<string> {
  const name = `e2e-${randomUUID().slice(0, 8)}`
  await expect(page.locator('input[name=loginIdentifier]')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '第一次使用' }).click()
  await page.locator('input[name=loginIdentifier]').fill(name)
  await page.locator('input[name=credential]').fill(PASSWORD)
  await page.getByRole('button', { name: '注册并登录' }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
  return name
}

export async function signIn(page: Page, name: string): Promise<void> {
  await page.locator('input[name=loginIdentifier]').fill(name)
  await page.locator('input[name=credential]').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '新建会话' })).toBeEnabled({ timeout: 30_000 })
}

/** What the main process says of the desk layer's window, or null when there is none. */
export const deskWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const desk = BrowserWindow.getAllWindows().find(each =>
      each.webContents.getURL().includes('/desk.html'),
    )
    return desk === undefined
      ? null
      : {
          visible: desk.isVisible(),
          top: desk.isAlwaysOnTop(),
          everywhere: desk.isVisibleOnAllWorkspaces(),
          focusable: desk.isFocusable(),
        }
  })

export const deskPage = (app: ElectronApplication): Page => {
  const found = app.windows().find(each => each.url().includes('/desk.html'))
  if (found === undefined) throw new Error('no desk page')
  return found
}

export const blurMain = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(each => !/\/(desk|shot)\.html/.test(each.webContents.getURL()))
      ?.blur(),
  )

export const deskFigure = (desk: Page) => desk.locator('.omne-figure-reach')

export const recall = (page: Page) => page.getByRole('button', { name: RECALL })

/**
 * Presses the figure at home and drags it past the edge of the viewport with Playwright's mouse, waits until the
 * desk layer has taken it (the page shows the empty seat), then lets go out there unless `letGo` is false.
 */
export async function liftOut(page: Page, letGo = true): Promise<void> {
  const carried = page.locator('.omne-figure-carried')
  await expect(carried).toHaveAttribute('data-phase', 'seated', { timeout: 15_000 })
  const box = await page.locator('.omne-figure-carried').boundingBox()
  if (box === null) throw new Error('the figure is not on the page')
  const [width, height] = (await page.evaluate('[innerWidth, innerHeight]')) as [number, number]
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 12, y + 12, { steps: 3 })
  await page.mouse.move(width + 120, height / 2, { steps: 12 })
  await expect(recall(page)).toBeVisible({ timeout: 15_000 })
  if (letGo) await page.mouse.up()
}

/** The desk layer's page once the main process shows its window. */
export async function deskShown(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => deskWindow(app), { timeout: 15_000 }).toMatchObject({ visible: true })
  return deskPage(app)
}

/** The desk layer's page once its window shows and it has settled the figure, drawn in the built-in ink. */
export async function onDesk(app: ElectronApplication): Promise<Page> {
  const desk = await deskShown(app)
  await expect(desk.locator('main.desk[data-mode=rest] .omne-figure-ink')).toHaveCount(1)
  return desk
}
