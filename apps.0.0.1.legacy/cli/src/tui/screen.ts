import { CURSOR_MARKER, Input, stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui'

export function safeText(text: string): string {
  return text
    .toWellFormed()
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,
      c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    )
}
export interface Screen {
  readonly identity: readonly string[]
  readonly title: string
  readonly body: readonly string[]
  readonly footer: string
  readonly page: number
  readonly input?: Input
}
export interface Layout {
  readonly bytes: string
  readonly rendered?: RenderedScreen
  readonly fits: boolean
  readonly page: number
  readonly pages: number
}
interface RenderedScreen {
  readonly columns: number
  readonly rows: number
  readonly lines: readonly string[]
  readonly cursor: { readonly row: number; readonly column: number }
}
function paint(
  lines: readonly string[],
  columns: number,
  rows: number,
  cursor?: RenderedScreen['cursor'],
): Pick<Layout, 'bytes' | 'rendered'> {
  const bytes = '\x1b[H\x1b[2J' + lines.join('\r\n') + (cursor ? position(cursor) : '')
  if (
    lines.length > rows ||
    lines.some(line => /[\u0000-\u001f\u007f-\u009f]/u.test(line) || visibleWidth(line) >= columns)
  )
    return { bytes }
  return {
    bytes,
    rendered: {
      columns,
      rows,
      lines: lines.map(line => line.replace(/ +$/u, '')),
      cursor: cursor ?? { row: lines.length, column: visibleWidth(lines.at(-1) ?? '') + 1 },
    },
  }
}
function position(cursor: RenderedScreen['cursor']): string {
  return `\x1b[${cursor.row};${cursor.column}H`
}
function sameSize(previous: RenderedScreen | undefined, next: RenderedScreen | undefined): boolean {
  return previous?.columns === next?.columns && previous?.rows === next?.rows
}
function changes(previous: RenderedScreen | undefined, frame: Frame): string {
  const next = frame.rendered
  if (!previous || !next || !sameSize(previous, next)) return frame.bytes
  let bytes = ''
  for (let row = 0; row < Math.max(previous.lines.length, next.lines.length); row++) {
    const line = next.lines[row] ?? ''
    if (line !== (previous.lines[row] ?? ''))
      bytes += position({ row: row + 1, column: 1 }) + '\x1b[2K' + line
  }
  if (
    bytes !== '' ||
    previous.cursor.row !== next.cursor.row ||
    previous.cursor.column !== next.cursor.column
  )
    bytes += position(next.cursor)
  return bytes
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = '',
    used = 0
  // Word wrapping may discard boundary spaces; values need their exact visible text.
  for (const { segment } of graphemes.segment(safeText(text))) {
    const size = visibleWidth(segment)
    if (used + size > width && line !== '') {
      lines.push(line)
      line = ''
      used = 0
    }
    line += segment
    used += size
  }
  lines.push(line)
  return lines
}
export function layout(screen: Screen, columns: number, rows: number): Layout {
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns < 1 || rows < 1)
    return { bytes: '', fits: false, page: 0, pages: 1 }
  const width = Math.max(1, columns - 1)
  const wrapped = (text: string) => wrap(text, width)
  const identity = screen.identity.flatMap(wrapped)
  const title = wrapped(screen.title),
    footer = wrapped(screen.footer)
  const capacity = rows - identity.length - title.length - footer.length - 4
  if (columns < 60 || rows < 16 || capacity < 1) {
    // No business eligibility for this revision. Even the notice must not scroll.
    const notice = 'Window too small. Enlarge to show the full identity and current step.'
    const lines = wrapped(notice).slice(0, Math.max(1, rows - 1))
    return { ...paint(lines, columns, rows), fits: false, page: 0, pages: 1 }
  }
  const body = screen.body.flatMap(wrapped)
  const pages = Math.max(1, Math.ceil(body.length / capacity))
  const page = Math.min(Math.max(screen.page, 0), pages - 1)
  const lines = [...identity, '', ...title, ...body.slice(page * capacity, (page + 1) * capacity)]
  // Reserve a stable footer/input region rather than letting body growth scroll identity.
  while (lines.length < rows - footer.length - 3) lines.push('')
  lines.push(`Page ${page + 1}/${pages}`)
  let cursor: RenderedScreen['cursor'] | undefined
  if (screen.input) {
    const rendered = screen.input.render(width)[0] ?? ''
    const marker = rendered.indexOf(CURSOR_MARKER)
    if (marker >= 0)
      cursor = { row: lines.length + 1, column: visibleWidth(rendered.slice(0, marker)) + 1 }
    lines.push(stripTerminalSequences(rendered.replaceAll(CURSOR_MARKER, '')))
  } else lines.push('')
  lines.push(...footer)
  return { ...paint(lines, columns, rows, cursor), fits: true, page, pages }
}

interface Frame {
  readonly revision: number
  readonly bytes: string
  readonly rendered?: Layout['rendered']
  readonly delivered: () => void
}
/** One actual write plus one latest state; callback completion is the delivery fence. */
export class FrameWriter {
  readonly #write: (bytes: string) => Promise<void>
  readonly #failed: () => void
  #latest: Frame | undefined
  #work: Promise<void> | undefined
  #revision = 0
  #closed = false
  #failure = false
  #painted: RenderedScreen | undefined
  #submitted: RenderedScreen | undefined
  #resizeRevision = 0
  constructor(write: (bytes: string) => Promise<void>, failed: () => void) {
    this.#write = write
    this.#failed = failed
  }
  get failed(): boolean {
    return this.#failure
  }
  submit(frame: Frame): void {
    if (this.#closed || this.#failure) return
    if (!sameSize(this.#submitted, frame.rendered)) {
      this.#resizeRevision++
      this.#painted = undefined
    }
    this.#submitted = frame.rendered
    this.#revision = frame.revision
    this.#latest = frame
    if (this.#work === undefined) {
      // Start in a microtask so #work owns even a synchronous writer failure.
      this.#work = Promise.resolve()
        .then(() => this.#pump())
        .finally(() => {
          this.#work = undefined
          if (this.#latest && !this.#closed && !this.#failure) this.submit(this.#latest)
        })
    }
  }
  async #pump(): Promise<void> {
    while (!this.#closed && this.#latest) {
      const frame = this.#latest
      const resizeRevision = this.#resizeRevision
      this.#latest = undefined
      try {
        await this.#write(changes(this.#painted, frame))
      } catch {
        this.#failure = true
        this.#latest = undefined
        this.#failed()
        return
      }
      this.#painted = resizeRevision === this.#resizeRevision ? frame.rendered : undefined
      if (!this.#closed && this.#revision === frame.revision) frame.delivered()
    }
  }
  async close(): Promise<void> {
    this.#closed = true
    this.#latest = undefined
    await this.#work
  }
}
