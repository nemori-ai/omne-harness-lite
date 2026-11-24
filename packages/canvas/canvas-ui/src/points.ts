import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import { defineRenderPoint, type RenderPoint } from '@omne-harness/shell-contract'

/** What a thing on the canvas refers to: the kind its owner declared, and its identifier in that kind. */
export type CanvasReference = CanvasItemBody['reference']

/** The frame a thing is drawn in: on the sheet, as the page a pile shows, or as a row of the search. */
export type CanvasFrame = 'sheet' | 'pile' | 'search'

/** What a picker or an intake may say with a reference: the size it would take on the sheet, in its units. */
export type CanvasPlacing = Readonly<{ size?: Readonly<{ width: number; height: number }> }>

export type CanvasElementSubject = Readonly<{ reference: CanvasReference; frame: CanvasFrame }>

export type CanvasPickerSubject = Readonly<{
  query: string
  pick: (reference: CanvasReference, placing?: CanvasPlacing) => void
}>

export type CanvasIntakeSubject = Readonly<{
  files: readonly File[]
  place: (reference: CanvasReference, placing?: CanvasPlacing) => void
  done: () => void
}>

export type CanvasAppSubject = Readonly<{ name: string }>

export const CANVAS_ELEMENT = 'canvas.element'
export const CANVAS_PICKER = 'canvas.picker'
export const CANVAS_INTAKE = 'canvas.intake'
export const CANVAS_APP_RENDER = 'canvas.app-render'

/** The point on the server's tree whose keys are the kinds now declared for the canvas. */
export const CANVAS_KINDS = 'canvas.kinds'

const KIND_KEY =
  'the name of the kind, <domain>.<name>, as it is declared on canvas.kinds: OmneExtensionPoints show canvas.kinds lists the names'

export const canvasElement: RenderPoint<CanvasElementSubject> = defineRenderPoint({
  name: CANVAS_ELEMENT,
  key: KIND_KEY,
  summary: 'How a thing of one kind is drawn on the canvas, by the domain that owns the kind.',
  keysFrom: CANVAS_KINDS,
  subject:
    'the reference, with kind and ref; and frame, which is sheet, pile (the page a pile shows) or search (a row of the search)',
  example: [
    '{"point":"canvas.element","key":"notes.note","module":"note.js","export":"note"}',
    'note.js:',
    'export const note = ({ React }) => ({ subject }) =>',
    "  React.createElement('p', null, subject.reference.ref)",
  ].join('\n'),
})

export const canvasPicker: RenderPoint<CanvasPickerSubject> = defineRenderPoint({
  name: CANVAS_PICKER,
  key: KIND_KEY,
  summary: 'How a person picks one thing of a kind from the search, to put it on the canvas.',
  keysFrom: CANVAS_KINDS,
  subject:
    'query, the text of the search; and pick(reference, { size }), which puts the thing with that reference on the canvas, size being the width and height it would take, which may be left out',
  example: [
    '{"point":"canvas.picker","key":"notes.note","module":"pick-note.js","export":"pick"}',
    'pick-note.js:',
    'export const pick = ({ React }) => ({ subject }) =>',
    "  React.createElement('p', { onClick: () => subject.pick({ kind: 'notes.note', ref: subject.query }) }, subject.query)",
  ].join('\n'),
})

export const canvasIntake: RenderPoint<CanvasIntakeSubject> = defineRenderPoint({
  name: CANVAS_INTAKE,
  key: 'what is handed onto the canvas: files is the one there is now',
  summary: 'How what is dropped onto the canvas becomes a reference put on it.',
  subject:
    'files, the files handed in; place(reference, { size }), which puts the thing with that reference on the canvas, size being the width and height it would take, which may be left out; and done(), which says this handing in is over',
  example: [
    '{"point":"canvas.intake","key":"files","module":"take-files.js","export":"take"}',
    'take-files.js:',
    'export const take = ({ React }) => ({ subject }) =>',
    "  React.createElement('p', null, subject.files.length + ' files')",
  ].join('\n'),
})

export const canvasAppRender: RenderPoint<CanvasAppSubject> = defineRenderPoint({
  name: CANVAS_APP_RENDER,
  key: 'the name of the canvas app, any text: it is the identifier of a canvas.app reference',
  summary: 'How the canvas app of this name is drawn, put by the plugin that brings it.',
  subject: 'name, the name of the canvas app',
  example: [
    '{"point":"canvas.app-render","key":"clock","module":"clock.js","export":"clock"}',
    'clock.js:',
    'export const clock = ({ React }) => ({ subject }) =>',
    "  React.createElement('h2', null, subject.name)",
  ].join('\n'),
})

export const canvasPoints = [canvasElement, canvasPicker, canvasIntake, canvasAppRender] as const
