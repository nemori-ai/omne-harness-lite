import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import {
  ScheduleCommandSchema,
  ScheduleDefinitionSchema,
  ScheduleInstantSchema,
  ScheduleInitialStateSchema,
} from '@omne-harness/schedule-contract'
import { scheduleToolResultSchema } from '@omne-harness/schedule-tools'
import { settingsWorld } from '../tests/assembly/settings-world.ts'
import { openToolHostWorld } from '../tests/assembly/tool-host-world.ts'

const inputSchema = z.strictObject({
  settings: z.strictObject({ timezone: z.string(), calendar: z.string().nullable() }),
  definition: ScheduleDefinitionSchema,
  after: ScheduleInstantSchema,
  initial: ScheduleInitialStateSchema,
  commands: z.array(z.record(z.string(), z.unknown())).max(20),
})
const path = process.argv[2]
if (!path) throw new Error('Pass a management example JSON file path')
const input = inputSchema.parse(JSON.parse(await readFile(resolve(path), 'utf8')))
const domain = await settingsWorld(input.settings)
const steps: unknown[] = []
try {
  const host = await openToolHostWorld({ world: domain })
  try {
    const previewInput = {
      source: { kind: 'inline' as const, definition: input.definition },
      after: input.after,
      count: 4,
    }
    const preview = scheduleToolResultSchema.parse(
      (await host.invoke('Schedule', { action: 'preview', input: previewInput })).returned,
    )
    steps.push({ action: 'preview', result: preview })
    if (preview.kind !== 'result' || preview.action !== 'preview')
      throw new Error(JSON.stringify(preview))
    const direct = await domain.app.queries.preview(domain.context, previewInput)
    if (!isDeepStrictEqual(preview.result, direct))
      throw new Error('Tool and direct preview disagree')
    if (preview.result.kind !== 'ok' || !preview.result.value.complete) {
      process.exitCode = 1
    } else {
      const created = scheduleToolResultSchema.parse(
        (
          await host.invoke(
            'Schedule',
            {
              action: 'create',
              input: {
                definition: input.definition,
                initial: input.initial,
                meta: { expectedRevision: null, consentRef: null },
              },
            },
            'manual-create',
          )
        ).returned,
      )
      steps.push({ action: 'create', result: created })
      if (
        created.kind !== 'result' ||
        created.action !== 'create' ||
        created.result.kind !== 'committed'
      ) {
        process.exitCode = 1
      } else {
        let view = created.result.value
        const operationCall = await host.invoke('Schedule', {
          action: 'queryOperation',
          input: created.operation,
        })
        if (operationCall.terminal.kind !== 'completed')
          throw new Error(JSON.stringify(operationCall.terminal))
        const operation = scheduleToolResultSchema.parse(operationCall.returned)
        steps.push({ action: 'queryOperation', result: operation })
        if (
          operation.kind !== 'result' ||
          operation.action !== 'queryOperation' ||
          operation.result.kind !== 'ok' ||
          operation.result.value.kind !== 'committed'
        )
          throw new Error(JSON.stringify(operation))
        for (const requested of input.commands) {
          const command = ScheduleCommandSchema.parse({
            ...requested,
            scheduleId: view.scheduleId,
            meta: {
              operationKey: 'host-replaces-this',
              expectedRevision: view.revision,
              consentRef: null,
            },
          })
          const { operationKey: _operationKey, ...meta } = command.meta
          const result = scheduleToolResultSchema.parse(
            (
              await host.invoke('Schedule', {
                action: 'execute',
                input: { ...command, meta },
              })
            ).returned,
          )
          steps.push({ action: command.action, result })
          if (
            result.kind !== 'result' ||
            result.action !== 'execute' ||
            (result.result.kind !== 'committed' && result.result.kind !== 'noChange')
          ) {
            process.exitCode = 1
            break
          }
          view = result.result.value
        }
        const finalCall = await host.invoke('Schedule', {
          action: 'get',
          input: { scheduleId: view.scheduleId },
        })
        if (finalCall.terminal.kind !== 'completed')
          throw new Error(JSON.stringify(finalCall.terminal))
        const final = scheduleToolResultSchema.parse(finalCall.returned)
        steps.push({ action: 'get', result: final })
        if (final.kind !== 'result' || final.action !== 'get' || final.result.kind !== 'ok')
          throw new Error(JSON.stringify(final))
      }
    }
    process.stdout.write(
      JSON.stringify(
        {
          evidenceScope: host.evidenceScope,
          database: {
            calendar: domain.calendar.root,
            schedule: domain.schedule.root,
            settings: domain.settings.root,
          },
          input,
          steps,
          persisted: {
            schedules: domain.schedule.sql('SELECT count(*) AS count FROM sc_schedules'),
            revisions: domain.schedule.sql('SELECT count(*) AS count FROM sc_revisions'),
          },
        },
        (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value),
        2,
      ) + '\n',
    )
  } finally {
    await host.close()
  }
} finally {
  await domain.close()
}
