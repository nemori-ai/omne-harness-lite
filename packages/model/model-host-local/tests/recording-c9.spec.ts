// @module-tag slow — starts openssl child processes and real local HTTPS servers, writes vault
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
import type { PreparationLineage } from '@omne-harness/model-contract'
import { decoded } from './support/local-host.ts'
import { inputEstimate, known, measureOn } from './support/metering.ts'
import { officialProfile } from './support/profiles.ts'
import {
  continuedRequest,
  firstRoundRequest,
  RECORD_CASES,
  type RecordCaseName,
} from './support/recording-cases.ts'
import { acknowledgeAndClean, onlyDispatch, openReplay } from './support/replay.ts'

type Family = Readonly<{
  file: string
  first: RecordCaseName
  continued: RecordCaseName
  outputGroup: string
}>

const FAMILIES: readonly Family[] = [
  {
    file: 'pi-ai-openai',
    first: 'openai-reasoning',
    continued: 'openai-reasoning-continued',
    outputGroup: 'openai-complete-output-group-workload-estimated/1',
  },
  {
    file: 'pi-ai-anthropic',
    first: 'anthropic-reasoning',
    continued: 'anthropic-reasoning-continued',
    outputGroup: 'anthropic-complete-signed-encrypted-output-zero-framing-estimated/1',
  },
]
const ANCHORED = '+continuation-anchored/1'

function sumDecimals(lexemes: readonly string[]): string {
  const parts = lexemes.map(lexeme => {
    const [whole = '', fraction = ''] = lexeme.split('.')
    return { whole, fraction }
  })
  const places = Math.max(...parts.map(part => part.fraction.length))
  const total = parts.reduce(
    (sum, part) => sum + BigInt(part.whole + part.fraction.padEnd(places, '0')),
    0n,
  )
  const digits = total.toString().padStart(places + 1, '0')
  const whole = digits.slice(0, digits.length - places)
  const fraction = digits.slice(digits.length - places).replace(/0+$/u, '')
  return fraction === '' ? whole : `${whole}.${fraction}`
}

function payable(account: Parameters<typeof payableAmount>[0]) {
  const result = payableAmount(account)
  if (!('ok' in result) || result.ok.state !== 'known') throw new Error('the payable is not known')
  return result.ok
}

describe('C9: the estimate of the continued request against the real input of the continued round', () => {
  it('the decimal adder of the evidence agrees with known sums', () => {
    expect(sumDecimals(['0.000123', '0.000858'])).toBe('0.000981')
    expect(sumDecimals(['0.1', '0.9'])).toBe('1')
    expect(sumDecimals(['12', '0.50'])).toBe('12.5')
    expect(sumDecimals(['0.0000001', '0.0000009'])).toBe('0.000001')
  })

  it.each(FAMILIES.map((item): [string, Family] => [item.file, item]))(
    '%s: the anchor hits, and the cumulative payable is the exact decimal sum of the two rounds',
    async (_name, family) => {
      const firstCase = RECORD_CASES[family.first]
      const first = firstRoundRequest(firstCase)

      const opened = await openReplay({
        request: first,
        name: family.first,
        label: `c9-${family.file}-x`,
      })
      let metering: Readonly<{
        amount: string
        margin: string
        method: string
        calibration: unknown
      }>
      let firstRound: Readonly<{ payloadDigest: string; payable: ReturnType<typeof payable> }>
      let next: ReturnType<typeof continuedRequest>
      try {
        expect(opened.driven).toEqual({ ok: undefined })
        const blocks = await opened.readBlocks()
        const record = await onlyDispatch(opened.local)
        await acknowledgeAndClean(opened)
        const receipt = record.materialization?.receipt
        if (receipt === undefined) throw new Error('X has no receipt')
        expect(receipt.payloadDigest).toBe(opened.note.payloadDigest)
        firstRound = { payloadDigest: receipt.payloadDigest, payable: payable(record.account) }

        next = continuedRequest({ first, replayed: { blocks, record } })
        const reply = next.messages[1]
        if (reply === undefined) throw new Error('the next request has no reply')
        const profile = officialProfile({
          family: firstCase.family,
          model: firstCase.model,
          retryPolicy: first.retryPolicy,
        })
        const lineage: PreparationLineage = {
          continues: opened.local.call,
          sources: [{ message: reply.id, call: opened.local.call }],
        }
        const lease = decoded(
          await opened.local.host.preparation.acquire({
            ...opened.local.access,
            profile,
            lineage,
          }),
        )
        try {
          const budget = decoded(await measureOn(lease, profile, next))
          const estimate = inputEstimate(budget)
          expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
          expect(estimate.method.name).toContain(family.outputGroup)
          expect(estimate.method.name.endsWith(`+${family.outputGroup}${ANCHORED}`)).toBe(true)
          metering = {
            amount: estimate.amount,
            margin: estimate.margin,
            method: estimate.method.name,
            calibration: budget.calibration,
          }
        } finally {
          expect(await lease.release()).toEqual({})
        }
      } finally {
        await opened.close()
      }

      const second = await openReplay({
        request: next,
        name: family.continued,
        label: `c9-${family.file}-y`,
      })
      try {
        expect(second.driven).toEqual({ ok: undefined })
        const record = await onlyDispatch(second.local)
        const receipt = record.materialization?.receipt
        if (receipt === undefined) throw new Error('the continued round has no receipt')
        expect(receipt.payloadDigest).toBe(second.note.payloadDigest)

        const realInput =
          known(record.account, 'input') +
          known(record.account, 'cache-read') +
          known(record.account, 'cache-write')
        const difference = realInput - BigInt(metering.amount)
        const secondPayable = payable(record.account)

        expect(secondPayable.unit).toBe(firstRound.payable.unit)
        const cumulative = payable({
          ...record.account,
          cost: [
            {
              state: 'known',
              lexeme: firstRound.payable.lexeme,
              unit: firstRound.payable.unit,
              source: 'billable',
            },
            {
              state: 'known',
              lexeme: secondPayable.lexeme,
              unit: secondPayable.unit,
              source: 'billable',
            },
          ],
        })
        expect(cumulative.lexeme).toBe(
          sumDecimals([firstRound.payable.lexeme, secondPayable.lexeme]),
        )
        expect(cumulative.unit).toBe(firstRound.payable.unit)

        const out = process.env.OMNE_EVIDENCE_OUT
        if (out !== undefined && out !== '') {
          mkdirSync(out, { recursive: true })
          const evidence = {
            family: firstCase.family,
            model: firstCase.model,
            rounds: {
              first: {
                payloadDigest: firstRound.payloadDigest,
                payable: firstRound.payable,
              },
              continued: {
                payloadDigest: receipt.payloadDigest,
                payable: secondPayable,
              },
            },
            metering,
            realInputTotal: realInput.toString(),
            difference: difference.toString(),
            cumulative,
          }
          writeFileSync(join(out, `${family.file}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
        }
      } finally {
        await second.close()
      }
    },
  )
})
