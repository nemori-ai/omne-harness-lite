import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { FactKey, JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule, ReadHandlerModule } from '@omne-harness/sql-contract/worker'

const membersSchema = z.array(
  z.strictObject({ participant: z.string(), moduleUrl: z.string(), codeDigest: z.string() }),
)
const inputSchema = z.strictObject({
  commands: z.array(
    z.strictObject({ participant: z.string(), facts: z.record(z.string(), z.json()) }),
  ),
})

const parameters = new URL(import.meta.url).searchParams
const modules = new Map<string, ParticipantModule>()
for (const member of membersSchema.parse(JSON.parse(parameters.get('members') ?? 'null'))) {
  const bytes = readFileSync(fileURLToPath(member.moduleUrl))
  if (createHash('sha256').update(bytes).digest('hex') !== member.codeDigest)
    throw new Error(`projection read: ${member.participant} does not match its digest`)
  const loaded = (await import(member.moduleUrl)) as { default: ParticipantModule }
  modules.set(member.participant, loaded.default)
}

const stopped = (participant: string, reply: JsonValue) =>
  ({ kind: 'read', output: { kind: 'stopped', participant, reply } }) as const

export default {
  handler: parameters.get('handler') ?? '',
  protocol: parameters.get('protocol') ?? '',
  read(input, port) {
    const facts = new Map<string, JsonValue>()
    const keyOf = (fact: FactKey) => JSON.stringify([fact.key, fact.protocol])
    let response: JsonValue = null
    for (const command of inputSchema.parse(input).commands) {
      const module = modules.get(command.participant)
      if (module === undefined) return stopped(command.participant, { kind: 'not-a-member' })
      let reply: ReturnType<ParticipantModule['execute']>
      try {
        reply = module.execute(command.facts, {
          execute: (sql, params) => port.execute(sql, params),
          requireFact: fact => {
            const value = facts.get(keyOf(fact))
            if (value === undefined) throw new Error('projection read: the fact is not provided')
            return value
          },
          provideFact: (fact, value) => {
            facts.set(keyOf(fact), value)
          },
        })
      } catch {
        return stopped(command.participant, { kind: 'failed' })
      }
      if (reply.kind !== 'participated')
        return stopped(
          command.participant,
          reply.kind === 'failed' ? { kind: 'failed' } : { kind: reply.kind, basis: reply.basis },
        )
      response = reply.response
    }
    return { kind: 'read', output: { kind: 'completed', response } }
  },
} satisfies ReadHandlerModule
