import { useEffect, useRef } from 'react'

import { CANVAS } from './ink.ts'
import { InkCanvas } from './ink-canvas.ts'
import { type Journeys, type Remnant } from './travel.ts'

interface Drawn {
  readonly wrap: HTMLSpanElement
  readonly ink: InkCanvas
  written: number
}

export function FigureJourneys({ journeys }: { readonly journeys: Journeys }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = root.current
    if (container === null) return undefined
    const drawn = new Map<number, Drawn>()
    const make = (remnant: Remnant): Drawn => {
      const { area, origin, size } = remnant
      const unit = size / CANVAS
      const wrap = document.createElement('span')
      wrap.className = 'omne-figure-ink omne-figure-remnant'
      wrap.setAttribute('aria-hidden', 'true')
      Object.assign(wrap.style, {
        left: `${(origin.x + area.x * unit).toFixed(1)}px`,
        top: `${(origin.y + area.y * unit).toFixed(1)}px`,
        width: `${(area.width * unit).toFixed(1)}px`,
        height: `${(area.height * unit).toFixed(1)}px`,
      })
      const canvas = document.createElement('canvas')
      canvas.className = 'omne-figure-paper'
      Object.assign(canvas.style, { left: '0', top: '0', width: '100%', height: '100%' })
      wrap.append(canvas)
      container.append(wrap)
      return { wrap, ink: new InkCanvas(canvas, size, area), written: -1 }
    }
    const unsubscribe = journeys.subscribe(remnants => {
      for (const remnant of remnants) {
        let paper = drawn.get(remnant.id)
        if (paper === undefined) {
          paper = make(remnant)
          drawn.set(remnant.id, paper)
        }
        if (paper.written !== remnant.written || remnant.tail !== null) {
          paper.written = remnant.written
          const { frame, tail } = remnant
          paper.ink.draw(
            frame.marks.length === 1 && (remnant.written < 1 || tail !== null)
              ? {
                  ...frame,
                  marks: [
                    {
                      ...frame.marks[0]!,
                      written: remnant.written,
                      ...(tail === null ? {} : { tail }),
                    },
                  ],
                }
              : frame,
          )
        }
        paper.wrap.style.opacity = remnant.opacity.toFixed(3)
      }
      for (const [id, paper] of drawn) {
        if (remnants.some(remnant => remnant.id === id)) continue
        paper.ink.dispose()
        paper.wrap.remove()
        drawn.delete(id)
      }
    })
    return () => {
      unsubscribe()
      for (const paper of drawn.values()) {
        paper.ink.dispose()
        paper.wrap.remove()
      }
      drawn.clear()
    }
  }, [journeys])

  return <div ref={root} className="omne-figure-journeys" aria-hidden="true" />
}
