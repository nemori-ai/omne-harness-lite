import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { RenderPoint } from '@omne-harness/shell-contract'
import { exampleOf, putExample, startShell } from '@omne-harness/shell-contract/testing'
import {
  canvasAppRender,
  canvasElement,
  canvasIntake,
  canvasPicker,
  type CanvasReference,
} from '../src/cordis.ts'

async function drawnExample<S>(point: RenderPoint<S>, subject: S): Promise<string> {
  const { shell } = await startShell()
  point.declare(shell)
  await putExample(shell, point.contract, { React })
  const { key } = exampleOf(point.contract).member
  return renderToStaticMarkup(<>{point.draw(shell, key, subject, () => 'generic')}</>)
}

it('the example of canvas.element draws the identifier of the reference', async () => {
  const subject = { reference: { kind: 'notes.note', ref: 'n-1' }, frame: 'sheet' } as const
  expect(await drawnExample(canvasElement, subject)).toBe('<p>n-1</p>')
  expect(canvasElement.contract.gives).toContain('the subject (the reference, with kind and ref;')
})

it('the example of canvas.picker shows the query and picks through the port it is given', async () => {
  const picked: CanvasReference[] = []
  const subject = { query: '周报', pick: (reference: CanvasReference) => picked.push(reference) }
  expect(await drawnExample(canvasPicker, subject)).toBe('<p>周报</p>')
})

it('the example of canvas.intake counts the files handed in', async () => {
  const subject = { files: [new File(['a'], 'a.txt')], place: () => {}, done: () => {} }
  expect(await drawnExample(canvasIntake, subject)).toBe('<p>1 files</p>')
})

it('the example of canvas.app-render draws the name of the app', async () => {
  expect(await drawnExample(canvasAppRender, { name: 'clock' })).toBe('<h2>clock</h2>')
})
