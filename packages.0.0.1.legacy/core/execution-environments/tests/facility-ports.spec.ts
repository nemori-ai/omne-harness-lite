import { expect, test } from 'vitest'
import { captureEnvironmentFacilities } from '../src/index.ts'

const commandNames = ['start', 'createTerminal', 'executeTerminal', 'closeTerminal', 'terminals']
const fileNames = [
  'read',
  'write',
  'stat',
  'list',
  'search',
  'move',
  'copy',
  'remove',
  'mkdir',
  'commitBatch',
  'recoverBatch',
]
const description = {
  reference: { provider: 'host', reference: 'generation' },
  bindingLayer: 'host_machine',
  binding: { kind: 'host_machine' },
  facilities: ['command', 'files'],
  instance: { id: 'host', generation: 'generation' },
  continuity: { kind: 'notGuaranteed' },
}
function ports(names: readonly string[]) {
  const receiver: Record<string, unknown> = { identity: {} }
  for (const name of names)
    receiver[name] = function (this: typeof receiver, input: unknown) {
      return { receiver: this.identity, input, name }
    }
  return receiver
}
test('all declared facility methods retain original receiver and captured callback identity', async () => {
  const command = ports(commandNames),
    files = ports(fileNames)
  const captured = captureEnvironmentFacilities({ description, command, files })!
  expect(Object.isFrozen(captured)).toBe(true)
  for (const [original, copied, names] of [
    [command, captured.command!, commandNames],
    [files, captured.files!, fileNames],
  ] as const) {
    expect(Object.isFrozen(copied)).toBe(true)
    for (const name of names) {
      original[name] = () => {
        throw new Error('Do not resolve a replacement callback')
      }
      const method = Reflect.get(copied, name) as (value: unknown) => unknown
      const input = { original: name }
      expect(await method(input)).toEqual({ receiver: original.identity, input, name })
    }
  }
})
test('facility declarations and complete implementation ports must agree in both directions', () => {
  for (const [name, names] of [
    ['command', commandNames],
    ['files', fileNames],
  ] as const) {
    const other = name === 'command' ? 'files' : 'command'
    const otherNames = name === 'command' ? fileNames : commandNames
    for (const missing of names) {
      const incomplete = ports(names)
      delete incomplete[missing]
      expect(
        captureEnvironmentFacilities({
          description,
          [name]: incomplete,
          [other]: ports(otherNames),
        }),
      ).toBeUndefined()
    }
    expect(
      captureEnvironmentFacilities({
        description: { ...description, facilities: [name] },
        [name]: ports(names),
      }),
    ).toBeDefined()
    expect(
      captureEnvironmentFacilities({
        description: { ...description, facilities: [name] },
        [name]: ports(names),
        [other]: ports(otherNames),
      }),
    ).toBeUndefined()
    expect(captureEnvironmentFacilities({ description, [name]: ports(names) })).toBeUndefined()
  }
  expect(captureEnvironmentFacilities(null)).toBeUndefined()
  expect(captureEnvironmentFacilities([])).toBeUndefined()
  expect(
    captureEnvironmentFacilities({
      get description() {
        throw new Error('unreadable')
      },
    }),
  ).toBeUndefined()
})
