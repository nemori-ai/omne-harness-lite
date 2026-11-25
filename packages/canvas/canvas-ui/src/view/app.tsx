import type { KeyRender } from '@omne-harness/shell-contract'
import type { ReactNode } from 'react'
import { CANVAS_APP_RENDER, canvasAppRender, type CanvasElementSubject } from '../points.ts'
import { inConflict, OneThing, type CanvasHost } from './element.tsx'

/** The canvas's own kind: a canvas app, its identifier the name it is put under on `canvas.app-render`. */
export const CANVAS_APP = 'canvas.app'

function Absent({ name, owners }: Readonly<{ name: string; owners: string | undefined }>) {
  return (
    <div className="canvas-generic" data-standing="absent">
      <span className="canvas-generic-ref">{name}</span>
      <span className="canvas-generic-note">这个小应用现在不在</span>
      {owners === undefined ? null : (
        <span className="canvas-generic-note">{`这个名字有两份，互相冲突：${owners}`}</span>
      )}
    </div>
  )
}

/** Draws the app of a `canvas.app` thing by its name; the app is given the name only, so it can only draw. */
export function appDrawing(host: CanvasHost): KeyRender<CanvasElementSubject> {
  return ({ scope, subject }) => {
    const name = subject.reference.ref
    if (subject.frame === 'search') return <span className="canvas-generic-ref">{name}</span>
    const absent = (): ReactNode => (
      <Absent name={name} owners={inConflict(host, CANVAS_APP_RENDER, name, scope)} />
    )
    return (
      <OneThing fallback={absent}>{canvasAppRender.draw(host, name, { name }, absent)}</OneThing>
    )
  }
}
