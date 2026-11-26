import type { Mount } from './page-trial.ts'

type Listener = (...args: never[]) => void

/** What the watch needs of a window's contents: Electron's `WebContents` is one, a stand-in in a test another. */
export type WatchedContents = Readonly<{
  on(event: string, listener: Listener): unknown
  once(event: string, listener: Listener): unknown
  off(event: string, listener: Listener): unknown
  isDestroyed(): boolean
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
}>

const LOAD_ABORTED = -3
const POLL_MS = 100
// The document as served holds a line that says it is starting; a page that came up put its own content in its place.
const RENDERED = `(() => {
  const root = document.getElementById('root')
  return root !== null && root.childElementCount > 0 && root.querySelector(':scope > .booting') === null
})()`

type Failure = Exclude<Mount, 'mounted' | 'not-mounted'>

/** Calls back once when the document fails to load, its renderer goes, or its window is closed. */
function onFailure(contents: WatchedContents, failed: (why: Failure) => void): () => void {
  const failedLoad = (_e: unknown, code: number, _d: string, _u: string, main: boolean): void => {
    if (main && code !== LOAD_ABORTED) failed('load-failed')
  }
  const gone = (_e: unknown, details: { reason: string }): void => {
    if (details.reason !== 'clean-exit') failed('renderer-gone')
  }
  const closed = (): void => failed('closed')
  contents.on('did-fail-load', failedLoad)
  contents.on('render-process-gone', gone)
  contents.once('destroyed', closed)
  return () => {
    contents.off('did-fail-load', failedLoad)
    contents.off('render-process-gone', gone)
    contents.off('destroyed', closed)
  }
}

/** Watches the load under way: it mounted once the finished document has rendered something into its root. */
export function watchMount(contents: WatchedContents, deadlineMs: number): Promise<Mount> {
  if (contents.isDestroyed()) return Promise.resolve('closed')
  return new Promise(resolve => {
    let poll: ReturnType<typeof setInterval> | undefined
    const settle = (mount: Mount): void => {
      clearInterval(poll)
      clearTimeout(deadline)
      stop()
      contents.off('did-finish-load', finished)
      resolve(mount)
    }
    const finished = (): void => {
      clearInterval(poll)
      poll = setInterval(() => {
        if (contents.isDestroyed()) return settle('closed')
        void contents.executeJavaScript(RENDERED, true).then(
          (rendered: unknown) => rendered === true && settle('mounted'),
          () => undefined,
        )
      }, POLL_MS)
    }
    const stop = onFailure(contents, settle)
    const deadline = setTimeout(() => settle('not-mounted'), deadlineMs)
    contents.on('did-finish-load', finished)
  })
}

/** After a mount: true when the page stayed up for the stable time. */
export function watchStable(contents: WatchedContents, stableMs: number): Promise<boolean> {
  if (contents.isDestroyed()) return Promise.resolve(false)
  return new Promise(resolve => {
    const settle = (stayed: boolean): void => {
      clearTimeout(timer)
      stop()
      resolve(stayed)
    }
    const stop = onFailure(contents, () => settle(false))
    const timer = setTimeout(() => settle(true), stableMs)
  })
}
