import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SchedulePreviewRequestSchema } from '@omne-harness/schedule-contract'
import { seededWorld } from '../tests/assembly/seeded-world.ts'

const path = process.argv[2]
if (!path) throw new Error('Pass a Schedule preview request JSON file path')
const request = SchedulePreviewRequestSchema.parse(
  JSON.parse(await readFile(resolve(path), 'utf8')),
)
if (request.source.kind !== 'inline')
  throw new Error('This isolated preview accepts an inline definition')
const binding = request.source.definition.binding
const calendarId = binding.kind === 'explicit' ? binding.calendar?.calendarId : undefined
const world = await seededWorld(calendarId)
try {
  const before = world.schedule.sql('SELECT count(*) AS count FROM sc_schedules')
  const result = await world.app.queries.preview(world.context, request)
  const after = world.schedule.sql('SELECT count(*) AS count FROM sc_schedules')
  process.stdout.write(
    JSON.stringify(
      {
        evidenceScope: world.evidenceScope,
        database: { calendar: world.calendar.root, schedule: world.schedule.root },
        request,
        result,
        readOnly: { before, after },
      },
      (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value),
      2,
    ) + '\n',
  )
  if (result.kind === 'error') process.exitCode = 1
  else if (!result.value.complete) process.exitCode = 2
} finally {
  await world.close()
}
