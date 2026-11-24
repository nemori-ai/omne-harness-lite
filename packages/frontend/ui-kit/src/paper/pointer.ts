export const SLOP = 4

export function capture(element: Element, pointer: number): void {
  try {
    element.setPointerCapture(pointer)
  } catch (error: unknown) {
    if (!(error instanceof DOMException)) throw error
  }
}

export function pastSlop(x: number, y: number): boolean {
  return Math.hypot(x, y) > SLOP
}
