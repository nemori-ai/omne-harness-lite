// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { ConverterBlock } from '../src/view/converter-block.tsx'

const LIMITS = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 4096,
  maxNumberLength: 32,
}
const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new Error('not a document')
  return read.value
}

/** The asset governance port as far as a block reads it: one asset of the category, its body read. */
const portOf = (name: string, body: unknown) => {
  const snapshot = {
    kind: 'read',
    assets: {
      kind: 'read',
      entries: [
        {
          row: { name },
          detail: { kind: 'read', asset: { content: { kind: 'data', body: tree(body) } } },
        },
      ],
    },
  }
  return {
    open: () => ({
      subscribe: () => () => undefined,
      getSnapshot: () => snapshot,
      close: () => {},
    }),
  }
}

const TENANT = 'tenant-text'

afterEach(cleanup)

it('a converter that sends content out: what it turns into what, and where the content goes', () => {
  const body = {
    kind: 'voice',
    engine: 'voice.transcribe',
    parameters: {},
    egress: { kind: 'remote', destination: 'openrouter.ai' },
  }
  render(
    <ConverterBlock
      port={portOf('voice', body)}
      tenant={TENANT}
      category="converter"
      name="voice"
    />,
  )
  expect(screen.getByText('做什么').nextElementSibling?.textContent).toBe('语音转成文字')
  expect(screen.getByText('内容去向').nextElementSibling?.textContent).toBe('发到 openrouter.ai')
})

it('a converter that stays on this machine says so', () => {
  const body = {
    kind: 'application-pdf',
    engine: 'pdf.extract-text',
    parameters: {},
    egress: { kind: 'in-process' },
  }
  render(
    <ConverterBlock
      port={portOf('application-pdf', body)}
      tenant={TENANT}
      category="converter"
      name="application-pdf"
    />,
  )
  expect(screen.getByText('做什么').nextElementSibling?.textContent).toBe('PDF 抽出文字')
  expect(screen.getByText('内容去向').nextElementSibling?.textContent).toBe('只在本机，不发到外面')
})
