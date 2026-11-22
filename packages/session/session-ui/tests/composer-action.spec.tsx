// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StopFace } from '../src/model/composer.ts'
import { ComposerActionSlot } from '../src/view/composer-action-slot.tsx'
import { iconButton } from './fixtures/icon-button.ts'

afterEach(cleanup)

const CONSEQUENCE = '停止这一轮。还没答的问题会一起关掉。'

function slot(face: StopFace, onStop = vi.fn()) {
  const view = render(
    <form>
      <ComposerActionSlot face={face} canSend onStop={onStop} />
    </form>,
  )
  return {
    onStop,
    face: (next: StopFace) =>
      view.rerender(
        <form>
          <ComposerActionSlot face={next} canSend onStop={onStop} />
        </form>,
      ),
  }
}

const describedBy = (button: HTMLElement) =>
  document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent ?? null

async function tooltipOf(button: HTMLElement): Promise<string | null> {
  await act(async () => button.focus())
  return (await screen.findByRole('tooltip')).textContent
}

describe('the composer action is one icon button whose face changes (A1, design 5.2)', () => {
  it('发送 is the send glyph on the solid face, and submits the form', async () => {
    slot('none')
    const button = iconButton(document.body, '发送', 'send')
    expect(button.getAttribute('data-variant')).toBe('default')
    expect(button.getAttribute('type')).toBe('submit')
    expect(describedBy(button)).toBeNull()
    expect(await tooltipOf(button)).toBe('发送')
  })

  it('停止 is the stop glyph; the tooltip and the description say what stopping does', async () => {
    const { onStop } = slot('stop')
    const button = iconButton(document.body, '停止', 'stop')
    expect(button.getAttribute('data-variant')).toBe('outline')
    expect(button.getAttribute('type')).toBe('button')
    expect(describedBy(button)).toBe(CONSEQUENCE)
    expect(await tooltipOf(button)).toBe(`停止：${CONSEQUENCE}`)
    fireEvent.click(button)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('正在停止 is the activity mark and cannot be pressed; 再确认停止 is the retry glyph', async () => {
    const { face } = slot('stopping')
    expect(iconButton(document.body, '正在停止', 'activity').disabled).toBe(true)
    face('confirm-stop')
    const confirm = iconButton(document.body, '再确认停止', 'retry')
    expect(confirm.disabled).toBe(false)
    expect(describedBy(confirm)).toBe(CONSEQUENCE)
    expect(await tooltipOf(confirm)).toBe(`再确认停止：${CONSEQUENCE}`)
  })

  it('stays one button element through every face, so it keeps its place and the focus', () => {
    const { face } = slot('none')
    const first = screen.getByRole('button')
    act(() => first.focus())
    for (const next of ['stop', 'stopping', 'confirm-stop', 'stop'] as const) {
      face(next)
      expect(screen.getByRole('button')).toBe(first)
    }
    expect(document.activeElement).toBe(first)
  })
})
