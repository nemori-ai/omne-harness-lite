import { access, readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const members = {
  codec: 'packages.0.0.1.legacy/core/model-request-runtime',
  values: 'packages.0.0.1.legacy/core/content-blocks',
  identity: 'packages.0.0.1.legacy/core/identity-values',
  sessionCore: 'packages.0.0.1.legacy/core/session-runtime',
  storage: 'packages.0.0.1.legacy/infra/storage-sql',
  log: 'packages.0.0.1.legacy/session/session-log-sql',
  runtime: 'packages.0.0.1.legacy/session/session-runtime-local',
}

export async function loadArtifacts(root) {
  const modules = {}
  const hashes = {}
  for (const [name, member] of Object.entries(members)) {
    const file = resolve(root, member, 'dist/index.js')
    await access(file)
    hashes[member] = await hashDist(resolve(root, member, 'dist'))
    modules[name] = await import(pathToFileURL(file).href)
  }
  return { ...modules, hashes }
}

async function hashDist(directory) {
  const hash = createHash('sha256')
  async function visit(path, relative) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const name = `${relative}/${entry.name}`
      if (entry.isDirectory()) await visit(resolve(path, entry.name), name)
      else if (entry.name.endsWith('.js'))
        hash.update(name).update(await readFile(resolve(path, entry.name)))
    }
  }
  await visit(directory, '')
  return hash.digest('hex')
}

export function createAdapter(modules, mode) {
  const { codec } = modules
  if (!['raw', 'owned'].includes(mode)) throw new Error(`Unknown adapter: ${mode}`)
  if (mode === 'owned' && typeof codec.captureModelLogHistory !== 'function') {
    throw new Error('Owned adapter requires the public captureModelLogHistory export')
  }
  function inspect(raw) {
    const result = codec.createModelLogReadInspector({
      tenant: raw.source.tenant,
      session: raw.source.session,
      prefix: { entries: raw.entries, tail: raw.source.tail },
    })
    if (!('ok' in result)) throw new Error(`Inspector rejected input: ${JSON.stringify(result)}`)
    return result.ok
  }
  return {
    mode,
    capture(previous, read) {
      if (mode === 'raw') {
        const cut = {
          entries: [...(previous?.raw.entries ?? []), ...read.entries],
          source: read.source,
        }
        return { raw: cut, inspector: inspect(cut) }
      }
      const result = codec.captureModelLogHistory(previous?.history ?? null, read)
      if (!('history' in result))
        throw new Error(`Capture rejected input: ${JSON.stringify(result)}`)
      const inspected = result.history.inspect()
      if (!('ok' in inspected))
        throw new Error(`History rejected input: ${JSON.stringify(inspected)}`)
      return { history: result.history, inspector: inspected.ok }
    },
    async read(runtime, journal) {
      const result =
        mode === 'owned' ? await runtime.readModelHistory(journal) : await journal.readPrefix()
      if ('failure' in result) throw new Error(`Journal read failed: ${result.failure}`)
      if (mode === 'owned') {
        if (!('history' in result)) throw new Error('Owned read fell back to a raw prefix')
        const inspected = result.history.inspect()
        if (!('ok' in inspected))
          throw new Error(`History rejected input: ${JSON.stringify(inspected)}`)
        return { history: result.history, inspector: inspected.ok }
      }
      return { raw: result, inspector: inspect(result) }
    },
    source: cut => cut.history?.source ?? cut.raw.source,
    entries: cut => cut.history?.entries ?? cut.raw.entries,
    length: cut => cut.history?.length ?? cut.raw.entries.length,
    bytes: cut =>
      cut.history?.retainedBytes ??
      Buffer.byteLength(
        modules.values.writeJsonLossless({ entries: cut.raw.entries, tail: cut.raw.source.tail }),
      ),
    facts(cut) {
      if (cut.history) return cut.history.sessionFacts({})
      const entries = []
      for (const entry of cut.raw.entries) {
        const result = modules.sessionCore.readSessionFact(entry)
        if ('failure' in result) return { invalid: true, entries }
        if (result.kind === 'fact') entries.push({ entry, fact: result.fact })
      }
      return { invalid: false, entries }
    },
    at: (cut, position) =>
      cut.history ? cut.history.entryAt(position - 1) : cut.raw.entries[position - 1],
    select(cut, selector) {
      if (typeof cut.inspector.select === 'function') return cut.inspector.select(selector)
      return cut.inspector.entries.filter(item => {
        if (selector.kind === 'message') return item.captured.message?.id === selector.id
        if (selector.kind === 'response') return item.captured.response?.id === selector.id
        if (selector.kind === 'readKey') return item.entry.readKeys.includes(selector.key)
        if (selector.kind === 'call')
          return (
            item.captured.record?.call === selector.call ||
            item.captured.response?.call.callId === selector.call
          )
        throw new Error(`Unsupported raw selector: ${selector.kind}`)
      })
    },
  }
}
