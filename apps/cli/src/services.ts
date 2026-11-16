import { randomUUID } from 'node:crypto'
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import type { CommandServices } from './cli-types.ts'
import { readCredential } from './credential.ts'

export const processServices: CommandServices = {
  createTransport: (origin, credentials) => createHttpProtocolTransport({ origin, credentials }),
  readCredential: prompt => readCredential(process.stdin, text => prompt(text)),
  newId: () => randomUUID(),
}
