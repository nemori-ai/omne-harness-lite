/** happy-dom cancels a running animation when the test unmounts it; the dialogs' motion gets one that never cancels. */
export function stubAnimation(): void {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
}
