import type { JsonValue } from '@omne-harness/json-text'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { exampleOf, putExample, startShell } from '@omne-harness/shell-contract/testing'
import { assetsControl } from '../src/model/points.ts'

it('the example of a control draws a checkbox for a value of the kind it is put on, and hands on what the person chose', async () => {
  const { shell } = await startShell()
  assetsControl.declare(shell)
  await putExample(shell, assetsControl.contract, { React })
  const { key } = exampleOf(assetsControl.contract).member
  const chosen: JsonValue[] = []
  const subject = {
    title: '自动保存',
    schema: { kind: 'object', entries: [{ key: 'type', value: { kind: 'string', value: key } }] },
    value: { kind: 'boolean', value: true },
    disabled: false,
    change: (value: JsonValue) => void chosen.push(value),
  } as const
  const drawn = assetsControl.draw(shell, key, subject, () => 'generic')
  expect(renderToStaticMarkup(<>{drawn}</>)).toBe('<input type="checkbox" checked=""/>')
  const input = drawn as React.ReactElement<{ onChange: (event: object) => void }>
  input.props.onChange({ target: { checked: false } })
  expect(chosen).toEqual([{ kind: 'boolean', value: false }])
  expect(assetsControl.contract.gives).toContain('the subject (one setting: title;')
})
