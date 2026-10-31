import { describe, expect, it } from 'vitest'
import { readBodyText, type JsonValue } from '@omne-harness/assets'
import { toolBodyContract } from '@omne-harness/tool-contract/provider'
import { limits } from './tool-values.ts'

function body(text: string): JsonValue {
  const read = readBodyText(text, limits)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

describe('tool body programmable', () => {
  const port = toolBodyContract()

  it('projects programmable=true as the one declaration entry', () => {
    const permitted = body('{"name":"read_file","programmable":true}')
    expect(port.judge(permitted, { capabilityName: 'read_file' })).toEqual({ ok: true })
    expect(port.deriveDeclarations(permitted)).toEqual({ entries: ['programmable'] })
  })

  it('declares nothing for an omitted or false programmable', () => {
    for (const text of ['{"name":"read_file"}', '{"name":"read_file","programmable":false}']) {
      expect(port.judge(body(text))).toEqual({ ok: true })
      expect(port.deriveDeclarations(body(text))).toEqual({ entries: [] })
    }
  })

  it('rejects a programmable value that is not boolean, and does not convert it', () => {
    for (const value of ['"true"', '1', 'null']) {
      const invalid = body(`{"name":"read_file","programmable":${value}}`)
      expect(port.judge(invalid)).toEqual({ ok: false, rejected: 'invalid-programmable' })
      expect(() => port.deriveDeclarations(invalid)).toThrow(
        /failed judgment: invalid-programmable/,
      )
    }
  })

  it('lists programmable as a boolean field of the body schema', () => {
    expect(JSON.stringify(port.schema)).toContain(
      '{"key":"programmable","value":{"kind":"string","value":"boolean"}}',
    )
  })
})
