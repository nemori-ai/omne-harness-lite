Object.assign(Element.prototype, {
  animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
})
