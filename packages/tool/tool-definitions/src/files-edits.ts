import type { FileIdentity, FacilityResult } from '@omne-harness/execution-environment-contract'
import type { FilesAuthorEnvironment } from './environment.ts'
import type { ExactEdit } from './protocol.ts'
import { confirmation, diff, identityText } from './text.ts'

type Files = FilesAuthorEnvironment['files']
type Read = FileIdentity & { readonly text: string }
type Prepared = Readonly<{ path: string; identity: FileIdentity; before: string; after: string }>

export async function readComplete(files: Files, path: string): Promise<FacilityResult<Read>> {
  let offset = 0
  let first: FileIdentity | undefined
  let text = ''
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  for (;;) {
    const result = await files.read({ path, offsetBytes: offset })
    if (result.kind !== 'done') return result
    const page = result.value
    if (
      first !== undefined &&
      (first.version !== page.version || first.object.token !== page.object.token)
    )
      return { kind: 'rejected', requestId: result.requestId, reason: 'conflict' }
    first ??= page
    if (!page.eof && page.nextOffsetBytes <= offset)
      return { kind: 'rejected', requestId: result.requestId, reason: 'invalidInput' }
    try {
      text += decoder.decode(page.bytes, { stream: !page.eof })
    } catch {
      return { kind: 'rejected', requestId: result.requestId, reason: 'unsupported' }
    }
    if (page.eof) return { kind: 'done', requestId: result.requestId, value: { ...first, text } }
    offset = page.nextOffsetBytes
  }
}

function applyEdits(
  original: string,
  edits: readonly ExactEdit[],
): { text: string } | { reason: string } {
  const ranges: { start: number; end: number; replacement: string }[] = []
  for (const edit of edits) {
    const start = original.indexOf(edit.old_text)
    if (start < 0 || original.indexOf(edit.old_text, start + 1) >= 0)
      return { reason: `exact-match-required old_text=${JSON.stringify(edit.old_text)}` }
    ranges.push({ start, end: start + edit.old_text.length, replacement: edit.new_text })
  }
  ranges.sort((a, b) => a.start - b.start)
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]
    const current = ranges[index]
    if (previous !== undefined && current !== undefined && current.start < previous.end)
      return { reason: 'duplicate-or-overlapping-edits' }
  }
  let text = original
  for (const range of ranges.reverse())
    text = text.slice(0, range.start) + range.replacement + text.slice(range.end)
  return { text }
}

async function prepare(
  files: Files,
  edits: readonly ExactEdit[],
): Promise<{ prepared: readonly Prepared[] } | { error: string }> {
  const grouped = new Map<string, ExactEdit[]>()
  for (const edit of edits) {
    const group = grouped.get(edit.path) ?? []
    group.push(edit)
    grouped.set(edit.path, group)
  }
  const prepared: Prepared[] = []
  for (const [path, changes] of grouped) {
    const read = await readComplete(files, path)
    if (read.kind !== 'done')
      return {
        error: `path=${JSON.stringify(path)}\n${confirmation(read, () => '')}\npreflight failed; zero target changes`,
      }
    if (prepared.some(item => item.identity.object.token === read.value.object.token))
      return {
        error: `rejected path=${JSON.stringify(path)} reason=ambiguous-object-paths\npreflight failed; zero target changes`,
      }
    const changed = applyEdits(read.value.text, changes)
    if ('reason' in changed)
      return {
        error: `rejected path=${JSON.stringify(path)} reason=${changed.reason}\npreflight failed; zero target changes`,
      }
    prepared.push({ path, identity: read.value, before: read.value.text, after: changed.text })
  }
  return { prepared }
}
export async function editFiles(
  files: Files,
  edits: readonly ExactEdit[],
  batch: boolean,
): Promise<string> {
  const plan = await prepare(files, edits)
  if ('error' in plan) return plan.error
  const plannedDiff = plan.prepared
    .map(item => diff(item.path, item.before, item.after, item.identity.version))
    .join('\n')
  if (batch) {
    const result = await files.commitBatch({
      entries: plan.prepared.map(item => ({
        path: item.path,
        bytes: new TextEncoder().encode(item.after),
        expectedVersion: item.identity.version,
      })),
    })
    return `${confirmation(result, value => `${value.kind === 'committed' ? 'done' : 'unknown'} batch=${JSON.stringify(value.batch)}\nconfirmed published=${JSON.stringify(value.published)}${value.kind === 'unknown' ? ` reason=${value.reason}\nOriginal batch requires recovery. Do not resubmit.` : ''}`)}\nplanned diff (publication is confirmed only by the range above)\n${plannedDiff}`
  }
  const item = plan.prepared[0]
  if (item === undefined) return 'rejected reason=empty-edit'
  const result = await files.write({
    path: item.path,
    bytes: new TextEncoder().encode(item.after),
    mode: 'replace',
    expectedVersion: item.identity.version,
  })
  return `${confirmation(result, value => `path=${JSON.stringify(item.path)} ${identityText(value)}`)}\n${result.kind === 'done' ? 'applied diff' : 'planned diff (not confirmed)'}\n${plannedDiff}`
}
