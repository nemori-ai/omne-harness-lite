/** When a window counts as ready: it holds a finished document answered 2xx, and it is shown. */
export type Readiness = Readonly<{
  navigated(status: number): void
  finished(): void
  failed(): void
  shown(visible: boolean): void
}>

export function createReadiness(onReady: () => void): Readiness {
  let committed = false
  let succeeded = false
  let loaded = false
  let visible = false
  let ready = false
  const settle = () => {
    if (ready || !loaded || !visible) return
    ready = true
    onReady()
  }
  return {
    navigated(status) {
      committed = true
      succeeded = status >= 200 && status < 300
      loaded = false
    },
    finished() {
      // Chromium also finishes its own error document after a failed load: that one never commits.
      if (!committed) return
      loaded = succeeded
      settle()
    },
    failed() {
      committed = succeeded = loaded = false
    },
    shown(isVisible) {
      visible ||= isVisible
      settle()
    },
  }
}
