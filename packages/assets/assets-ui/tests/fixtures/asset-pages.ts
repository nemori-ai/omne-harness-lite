import { act, fireEvent, screen, within } from '@testing-library/react'

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** The rows of the asset lists now on screen, hidden ones left out. */
export const assetRows = (): HTMLElement[] =>
  screen.queryAllByRole('listitem').filter(element => element.classList.contains('assets-item'))

/** Goes from the list into the page of the asset of this name, and gives that page. */
export async function enterAsset(name: string): Promise<ReturnType<typeof within>> {
  const row = assetRows().find(element => element.getAttribute('aria-label') === name)
  if (row === undefined) throw new Error(`no row for ${name}`)
  fireEvent.click(within(row).getByRole('button'))
  await settle()
  return within(assetPage())
}

/** The page of the asset that is open now. */
export function assetPage(): HTMLElement {
  const page = document.querySelector<HTMLElement>('.assets-asset')
  if (page === null) throw new Error('no asset page is open')
  return page
}

/** Back from the page of an asset to the list. */
export async function backToList(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '回到列表' }))
  await settle()
}

/** Goes into the first asset listed, when there is one: most cases have one asset per category. */
export async function enterFirst(): Promise<void> {
  await settle()
  await settle()
  const [first] = assetRows()
  if (first === undefined) return
  fireEvent.click(within(first).getByRole('button'))
  await settle()
}
