// @module-tag slow — starts openssl child processes and real local HTTPS servers, writes vault
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { payableAmount, type Amount } from '@omne-harness/call-account'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import {
  checkModelProviderConformance,
  type ConformanceSubject,
} from '@omne-harness/model-contract/conformance'
import {
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { createNetworkResources, createPiTransport } from '@omne-harness/pi-ai-transport'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import { createCertificate, startHttpsServer } from './support/https-server.ts'
import { FAMILIES, PLACEHOLDER, ROUTE_PATH, TRANSPORT_LIMITS } from './support/local-host.ts'
import {
  RECORD_CASE_NAMES,
  RECORD_CASES,
  RECORDING_FILES,
  type RecordCaseName,
} from './support/recording-cases.ts'
import {
  onlyDispatch,
  openReplay,
  recordedRequest,
  recordingDirectory,
  replayLabel,
} from './support/replay.ts'

const TRANSPORT_OBLIGATIONS = [
  'transport-sends-only-at-start',
  'repeated-transport-step-sends-nothing',
  'materialization-receipt-matches-request',
  'fact-stream-ends-once',
  'interruption-is-confirmed',
  'transport-close-is-idempotent',
] as const

const CREDENTIAL = '代理注入真实密钥；凭据库只存占位值；占位值不出现在事实与发出记录中'

type KindRun = { kind: TransportFact['kind']; block?: string; count: number }

function kindsOf(facts: readonly TransportFact[]): readonly KindRun[] {
  const contents = new Map<string, string>()
  const runs: KindRun[] = []
  for (const fact of facts) {
    let block: string | undefined
    switch (fact.kind) {
      case 'block-open':
        contents.set(fact.index, fact.content)
        block = fact.content
        break
      case 'block-delta':
      case 'block-replace':
      case 'trim':
        block = contents.get(fact.index)
        break
      case 'block-seal':
        block = fact.block.kind
        break
      case 'account':
      case 'diagnostic':
      case 'ended':
        break
      default: {
        const _exhaustive: never = fact
        return _exhaustive
      }
    }
    const last = runs.at(-1)
    if (last !== undefined && last.kind === fact.kind && last.block === block) last.count += 1
    else runs.push({ kind: fact.kind, ...(block === undefined ? {} : { block }), count: 1 })
  }
  return runs
}

type ObligationResult = Readonly<{
  obligation: (typeof TRANSPORT_OBLIGATIONS)[number]
  status: string | undefined
  detail: string | undefined
}>

async function transportObligations(
  input: Readonly<{ request: FixedModelRequest; stream: Buffer }>,
): Promise<readonly ObligationResult[]> {
  const certificate = createCertificate()
  try {
    const server = await startHttpsServer(certificate, (res, request) => {
      if (request.path !== ROUTE_PATH) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(input.stream)
    })
    try {
      const counters: (() => number)[] = []
      const subject = (): ConformanceSubject<ScriptedPrincipal> => {
        const scripted = createScriptedConformanceSubject()
        const network = createNetworkResources({
          maxConnections: 2,
          idleConnectionTimeoutMs: 60_000,
          tls: { ca: certificate.cert },
        })
        let reads = 0
        const built = createPiTransport({
          network,
          families: FAMILIES,
          routes: {
            openrouter: {
              url: new URL(ROUTE_PATH, server.url).href,
              endMarker: GATEWAY_END_MARKER,
              accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
              auth: { kind: 'bearer', item: 'apiKey' },
            },
          },
          credential: {
            read: () => {
              reads += 1
              return new Map([['apiKey', PLACEHOLDER]])
            },
          },
          limits: TRANSPORT_LIMITS,
        })
        counters.push(() => reads)
        return {
          ...scripted,
          transport: {
            transport: built.transport,
            sends: () => reads,
            request: input.request,
            supplier: input.request.suppliers[0],
          },
          async dispose() {
            await scripted.dispose?.()
            await built.close()
            await network.close()
          },
        }
      }
      const report = await checkModelProviderConformance({ subject, waitMs: 10_000 })
      const counted = counters.reduce((total, sends) => total + sends(), 0)
      expect(counted).toBeGreaterThan(0)
      await expect.poll(() => server.requests.length).toBe(counted)
      expect(server.requests.every(request => request.path === ROUTE_PATH)).toBe(true)
      return TRANSPORT_OBLIGATIONS.map(obligation => {
        const result = report.results.find(entry => entry.obligation === obligation)
        return { obligation, status: result?.status, detail: result?.detail }
      })
    } finally {
      await server.close()
    }
  } finally {
    certificate.dispose()
  }
}

function amountOf(amount: Amount) {
  return {
    state: amount.state,
    amount: 'lexeme' in amount ? amount.lexeme : null,
    unit: amount.unit,
  }
}

async function assembledRun(name: RecordCaseName, request: FixedModelRequest) {
  const item = RECORD_CASES[name]
  const opened = await openReplay({ request, name, label: replayLabel('c1', name) })
  try {
    const { local, note } = opened
    expect(note.model).toBe(item.model)
    expect(opened.driven).toEqual({ ok: undefined })
    expect(opened.requests).toHaveLength(1)
    expect(opened.requests[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)
    const facts = local.facts
    const ended = facts.filter(
      (fact): fact is Extract<TransportFact, { kind: 'ended' }> => fact.kind === 'ended',
    )
    expect(ended).toHaveLength(1)
    expect(facts.at(-1)?.kind).toBe('ended')
    expect(ended[0]?.termination).toEqual({ kind: 'completed', reason: 'stop' })
    const record = await onlyDispatch(local)
    expect(record.terminal).toEqual(ended[0]?.termination)
    const receipt = record.materialization?.receipt
    if (receipt === undefined) throw new Error('the dispatch has no receipt')
    expect(receipt.payloadDigest).toBe(note.payloadDigest)
    const account = record.account
    if (account === null) throw new Error('the dispatch has no account')
    expect(account.cost.every(cost => cost.state === 'known' || cost.state === 'unknown')).toBe(
      true,
    )
    expect(account.cost.filter(cost => cost.source === 'billable')).toHaveLength(1)
    expect(JSON.stringify(facts)).not.toContain(PLACEHOLDER)
    expect(JSON.stringify(record)).not.toContain(PLACEHOLDER)
    return {
      model: note.model,
      payloadDigest: receipt.payloadDigest,
      replayFormat: receipt.replayFormat ?? null,
      facts: { count: facts.length, kinds: kindsOf(facts) },
      termination: ended[0]?.termination,
      account: {
        usage: account.usage.map(usage => ({ name: usage.name, ...amountOf(usage) })),
        cost: account.cost.map(cost => ({ source: cost.source, ...amountOf(cost) })),
        payable: payableAmount(account),
      },
    }
  } finally {
    await opened.close()
  }
}

describe('the fact sequence of each real recording keeps the six transport obligations', () => {
  it.each(RECORD_CASE_NAMES)(
    '%s: one termination, a real or unknown cost, and every transport obligation passes',
    async (name: RecordCaseName) => {
      const item = RECORD_CASES[name]
      const request = await recordedRequest(name)

      const path = await assembledRun(name, request)

      const stream = readFileSync(join(recordingDirectory(name), RECORDING_FILES.stream))
      const obligations = await transportObligations({ request, stream })
      expect(obligations).toEqual(
        TRANSPORT_OBLIGATIONS.map(obligation => ({ obligation, status: 'pass', detail: '' })),
      )

      const out = process.env.OMNE_EVIDENCE_OUT
      if (out !== undefined && out !== '') {
        mkdirSync(out, { recursive: true })
        const evidence = {
          case: name,
          family: item.family,
          ...path,
          obligations: obligations.map(({ obligation, status }) => ({ obligation, status })),
          credential: CREDENTIAL,
        }
        writeFileSync(join(out, `${name}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
      }
    },
  )
})
