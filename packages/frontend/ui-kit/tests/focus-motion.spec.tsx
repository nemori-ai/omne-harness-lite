// @vitest-environment happy-dom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  blockingOverlay,
  focusSurface,
  moveRegion,
  objectPart,
  objectView,
  ownsTyping,
  useReducedMotion,
} from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('focusSurface lands on the marked element first, then the first editor, then the surface', () => {
  document.body.innerHTML =
    '<div id="s" tabindex="-1"><button id="b">b</button><input id="i"><textarea id="t" data-initial-focus></textarea></div>'
  const surface = document.getElementById('s') as HTMLElement
  focusSurface(surface)
  expect(document.activeElement?.id).toBe('t')
  document.getElementById('t')?.removeAttribute('data-initial-focus')
  focusSurface(surface)
  expect(document.activeElement?.id).toBe('i')
  document.body.innerHTML = '<div id="s" tabindex="-1"><button>b</button></div>'
  focusSurface(document.getElementById('s') as HTMLElement)
  expect(document.activeElement?.id).toBe('s')
})

it('ownsTyping is true inside a field and false in a plain element', () => {
  document.body.innerHTML = '<input id="i"><div id="d"></div>'
  expect(ownsTyping(document.getElementById('i'))).toBe(true)
  expect(ownsTyping(document.getElementById('d'))).toBe(false)
  expect(ownsTyping(null)).toBe(false)
})

it('moveRegion walks the keyboard regions and wraps around', () => {
  document.body.innerHTML =
    '<section data-keyboard-region><button id="a">a</button></section><section data-keyboard-region><button id="b">b</button></section>'
  document.getElementById('a')?.focus()
  expect(moveRegion('next')).toBe(true)
  expect(document.activeElement?.id).toBe('b')
  expect(moveRegion('next')).toBe(true)
  expect(document.activeElement?.id).toBe('a')
  expect(moveRegion('previous')).toBe(true)
  expect(document.activeElement?.id).toBe('b')
})

it('moveRegion refuses while a modal is up, and blockingOverlay finds the modal', () => {
  document.body.innerHTML =
    '<section data-keyboard-region><button id="a">a</button></section><div data-keyboard-modal id="m"></div>'
  expect(blockingOverlay()?.id).toBe('m')
  expect(moveRegion('next')).toBe(false)
})

it('objectPart and objectView only write their data attributes', () => {
  expect(objectPart('cover')).toEqual({ 'data-object-part': 'cover' })
  expect(objectView('o1')).toEqual({ 'data-object-view': 'o1' })
})

it('useReducedMotion follows the media query and its changes', () => {
  const listeners = new Set<() => void>()
  const media = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => void listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', () => media)
  const { result } = renderHook(() => useReducedMotion())
  expect(result.current).toBe(false)
  act(() => {
    media.matches = true
    for (const listener of listeners) listener()
  })
  expect(result.current).toBe(true)
})

it('renders nothing of its own when a focus helper is called on an empty page', () => {
  render(<div />)
  expect(blockingOverlay()).toBeUndefined()
  expect(moveRegion('next')).toBe(false)
  expect(screen.queryByRole('dialog')).toBeNull()
})
