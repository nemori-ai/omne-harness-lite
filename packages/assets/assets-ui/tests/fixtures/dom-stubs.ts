export function stubAnimation(): void {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
}
