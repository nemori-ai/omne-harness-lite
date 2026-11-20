import { readTenantText } from '@omne-harness/public-contract'
import { parseInstant } from '@omne-harness/utc-instant'

export const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
export const TENANT_ID = readTenantText(TENANT)

/** happy-dom lays nothing out and animates nothing; charts need a measured box. */
export function stubDom(): void {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
  const box = { width: 480, height: 200, top: 0, left: 0, right: 480, bottom: 200, x: 0, y: 0 }
  HTMLElement.prototype.getBoundingClientRect = () => ({ ...box, toJSON: () => box }) as DOMRect
  for (const [name, value] of [
    ['clientWidth', 480],
    ['clientHeight', 200],
    ['offsetWidth', 480],
    ['offsetHeight', 200],
  ] as const)
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value })
}

export const instant = (text: string) => {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`not an instant: ${text}`)
  return parsed.value
}
