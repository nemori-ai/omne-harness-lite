import { within } from '@testing-library/react'
import { expect } from 'vitest'

/**
 * The icon button named `name` in `scope`, after checking it is one (A1): the name is its accessible name, its face
 * is the glyph named `glyph` (or the activity mark), and it writes no words.
 */
export function iconButton(scope: HTMLElement, name: string, glyph: string): HTMLButtonElement {
  const button = within(scope).getByRole<HTMLButtonElement>('button', { name })
  expect(button.getAttribute('aria-label'), name).toBe(name)
  expect(button.textContent?.trim(), `${name} writes no words`).toBe('')
  const face =
    glyph === 'activity'
      ? '[data-loading-indicator]'
      : `svg[data-icon="${glyph}"][aria-hidden="true"]`
  expect(button.querySelector(face), `${name} draws ${glyph}`).not.toBeNull()
  return button
}
