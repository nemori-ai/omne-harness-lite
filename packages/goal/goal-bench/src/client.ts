import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createNetworkResources } from '@omne-harness/pi-ai-transport'
import { createDecisions, type DecisionRequest } from '@omne-harness/pi-ai-transport/decisions'
import type { Decide, Decided, ReplyCache } from './replay.ts'

const LIMITS = {
  maxBytes: 262_144,
  maxDepth: 16,
  maxMembers: 2000,
  maxItems: 2000,
  maxNumberLength: 64,
  maxStringLength: 65_536,
}

/** The real decision interface. The key is read from a file and goes into the auth header only. */
export function openRouterDecide(
  keyFile: string,
): Readonly<{ decide: Decide; close: () => Promise<void> }> {
  const key = readFileSync(keyFile, 'utf8').trim()
  const network = createNetworkResources({ maxConnections: 8, idleConnectionTimeoutMs: 2000 })
  const decisions = createDecisions({
    network,
    timeoutMs: 120_000,
    maxRequestBytes: 262_144,
    maxQuestions: null,
    responseLimits: LIMITS,
    route: {
      endpoints: {
        decisions: { url: 'https://openrouter.ai/api/alpha/decisions', endMarker: null },
      },
      auth: { kind: 'bearer', item: 'apiKey' },
      accounting: { place: 'openrouter', costUnit: 'credit' },
    },
    credential: { read: () => new Map([['apiKey', key]]) },
  })
  const decide: Decide = async request => {
    const started =
      /* wall-clock: operation-timing -- how long one decision request took */ performance.now()
    const reply = await decisions.decide(
      request as unknown as DecisionRequest,
      new AbortController().signal,
    )
    if (!('ok' in reply)) {
      console.error(`decision failed: ${reply.failure.kind} (${reply.failure.dispatch})`)
      return null
    }
    const { answers, usage } = reply.ok
    return {
      answers,
      usage: { input: usage.input_tokens, output: usage.output_tokens, cost: usage.cost ?? 0 },
      ms: Math.round(
        /* wall-clock: operation-timing -- how long one decision request took */ performance.now() -
          started,
      ),
    }
  }
  return { decide, close: () => network.close() }
}

type Line = Readonly<{ key: string; decided: Decided }>

/** Replies kept as lines of JSON: read from every file given, appended to the last. */
export function fileCache(files: readonly string[]): ReplyCache & Readonly<{ size: () => number }> {
  const kept = new Map<string, Decided>()
  for (const file of files.filter(name => existsSync(name)))
    for (const text of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const line = JSON.parse(text) as Line
      kept.set(line.key, line.decided)
    }
  const out = files.at(-1)
  if (out !== undefined) mkdirSync(dirname(out), { recursive: true })
  return {
    get: key => kept.get(key),
    put: (key, decided) => {
      kept.set(key, decided)
      if (out !== undefined)
        appendFileSync(out, `${JSON.stringify({ key, decided } satisfies Line)}\n`)
    },
    size: () => kept.size,
  }
}
