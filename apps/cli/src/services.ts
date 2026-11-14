import { randomUUID } from 'node:crypto'
import { createHttpTransport } from '@omne-harness/sdk'
import type { CommandServices } from './cli-types.ts'
import { readCredential } from './credential.ts'

export const processServices: CommandServices = {
  createTransport: (origin, location) => createHttpTransport({ origin, location }),
  readCredential: prompt => readCredential(process.stdin, text => prompt(text)),
  newId: () => randomUUID(),
}
