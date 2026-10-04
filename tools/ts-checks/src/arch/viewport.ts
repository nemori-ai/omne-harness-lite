/// <reference lib="dom" />

/** Viewport state never changes the selected graph or its export. */
export function architectureViewport(
  svg: SVGSVGElement,
  container: HTMLElement,
  size: { width: number; height: number },
): { zoom: (factor: number) => void; fit: () => void; dispose: () => void } {
  let box = { x: 0, y: 0, width: size.width, height: size.height }
  let measuredWidth = 0,
    measuredHeight = 0
  const apply = (): void => {
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
  }
  const fit = (): void => {
    measuredWidth = container.clientWidth
    measuredHeight = container.clientHeight
    const ratio = Math.max(1, measuredWidth) / Math.max(1, measuredHeight)
    const width = Math.max(size.width, size.height * ratio)
    const height = width / ratio
    box = { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height }
    apply()
  }
  const zoom = (factor: number): void => {
    const width = Math.max(120, Math.min(size.width * 8, box.width / factor))
    const height = (width / box.width) * box.height
    box = {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    }
    apply()
  }
  let drag: { pointer: number; x: number; y: number; left: number; top: number } | undefined
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    if (event.target.closest('[data-node-id], [data-edge-id]') !== null) return
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: box.x, top: box.y }
    svg.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent): void => {
    if (drag === undefined || drag.pointer !== event.pointerId) return
    const rect = svg.getBoundingClientRect()
    box.x = drag.left - ((event.clientX - drag.x) / Math.max(1, rect.width)) * box.width
    box.y = drag.top - ((event.clientY - drag.y) / Math.max(1, rect.height)) * box.height
    apply()
  }
  const up = (): void => {
    drag = undefined
  }
  svg.addEventListener('pointerdown', down)
  svg.addEventListener('pointermove', move)
  svg.addEventListener('pointerup', up)
  svg.addEventListener('pointercancel', up)
  const observer = new ResizeObserver(() => {
    if (container.clientWidth !== measuredWidth || container.clientHeight !== measuredHeight) fit()
  })
  observer.observe(container)
  fit()
  return {
    zoom,
    fit,
    dispose: () => {
      observer.disconnect()
      svg.removeEventListener('pointerdown', down)
      svg.removeEventListener('pointermove', move)
      svg.removeEventListener('pointerup', up)
      svg.removeEventListener('pointercancel', up)
    },
  }
}
