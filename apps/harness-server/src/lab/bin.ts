#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { every } from '@omne-harness/time-source'
import { hostTime } from '../entry/time.ts'
import { resolveLocations } from '../local/locations.ts'
import {
  NotSetUpError,
  SERVE_OPTIONS,
  UsageError,
  recordWriter,
  serveInputs,
  type ServeInputs,
  serveUntilStopped,
  setupCommand,
} from '../local/serve-command.ts'
import { endProcess } from '../process-end.ts'
import { claimLabRoot } from '../state-instance.ts'
import { createLabClock, readSavedTime, saveTime } from './clock.ts'
import { answer, parseDuration, readingOf } from './control.ts'
import { startModelGateway, type ModelGateway } from './model-gateway/gateway.ts'
import {
  parseModelScript,
  providerUrlOf,
  scriptedAnswer,
  withModelRoute,
} from './model-gateway/script.ts'
import { LAB_EXAMINER_ROW, labExaminerRow } from './examiner.ts'
import { LAB_PROGRAMS_ROW, labProgramsRow } from './programs.ts'
import {
  LAB_READINGS_ROW,
  labReadingsRow,
  labVisibility,
  stepLine,
  storageLine,
  type ReadingsSource,
} from './readings.ts'

const USAGE =
  'usage: harness-server-lab setup [setup options]\n' +
  '       harness-server-lab serve [serve options] [--skip <duration>] [--speed <factor>] [--model-script <file>]\n' +
  '           [--examiner-model <model>]\n' +
  '--model-script: the model is a script read from the file at each request, not a provider;\n' +
  '    the requests its `provider` rules fit go to the provider as they came.\n' +
  '--examiner-model: every examination of a goal runs under this model, whatever the tenant set.\n' +
  'Control lines on standard input: read | skip <duration> | set <UTC instant> | speed <factor> | readings'

const LAB_OPTIONS = {
  ...SERVE_OPTIONS,
  skip: { type: 'string' },
  speed: { type: 'string' },
  'model-script': { type: 'string' },
  'examiner-model': { type: 'string' },
} as const

const PROTOCOL = 'simulated-clock'

/** The state directory a lab command works on: the one given, or the local one. */
function labStateDir(given: string | undefined): string {
  if (given !== undefined) return given
  const located = resolveLocations({
    platform: process.platform,
    env: process.env,
    home: homedir(),
  })
  if (located.kind === 'refused') throw new UsageError(located.message)
  return located.locations.stateDir
}

function claimed(dir: string): boolean {
  const claim = claimLabRoot(dir)
  if (claim.kind === 'claimed') return true
  process.stderr.write(`lab: ${claim.reason}\n`)
  return false
}

/** A gateway that answers every model request by the script in `file`, read anew each time so a journey can change it; what the script leaves to the provider is passed on. */
async function scriptedModel(file: string, counted: ReadingsSource): Promise<ModelGateway> {
  const read = () => parseModelScript(readFileSync(file, 'utf8'))
  try {
    read()
  } catch (error) {
    throw new UsageError(`--model-script ${file}: ${(error as Error).message}`)
  }
  const gateway = await startModelGateway(
    request => {
      recordWriter(stepLine(request, counted))
      return scriptedAnswer(read(), request)
    },
    request => providerUrlOf(read(), request),
  )
  gateway.trustInProcess()
  return gateway
}

type LabModel = Readonly<{ route(inputs: ServeInputs): ServeInputs; close(): Promise<void> }>
const PROVIDERS: LabModel = { route: inputs => inputs, close: async () => {} }

/** Where the model requests of this run go: to the providers, or to the script the option names. */
async function labModel(script: string | undefined, counted: ReadingsSource): Promise<LabModel> {
  if (script === undefined) return PROVIDERS
  const gateway = await scriptedModel(script, counted)
  return {
    route(inputs) {
      const layer = inputs.operator as Parameters<typeof withModelRoute>[0] | undefined
      if (layer === undefined) throw new UsageError('--model-script needs an operator layer')
      return { ...inputs, operator: withModelRoute(layer, gateway.url) }
    },
    close: () => gateway.close(),
  }
}

/** The release distribution and, after its rows, the rows only the lab assembly has. */
function withLabRows(inputs: ServeInputs, examiner: string | undefined): ServeInputs {
  const distribution = inputs.distribution as { rows?: readonly unknown[] }
  const always = [LAB_PROGRAMS_ROW, LAB_READINGS_ROW]
  const lab = examiner === undefined ? always : [...always, LAB_EXAMINER_ROW]
  return {
    ...inputs,
    distribution: { ...distribution, rows: [...(distribution.rows ?? []), ...lab] },
  }
}

async function serve(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({ args: [...argv], allowPositionals: true, options: LAB_OPTIONS })
  const dir = labStateDir(values['state-root'])
  if (!claimed(dir)) return 3
  const skip = values.skip === undefined ? 0 : parseDuration(values.skip)
  if (skip === undefined) throw new UsageError('--skip takes a duration such as 90s, 15m, 3h or 2d')
  const speed = values.speed === undefined ? undefined : Number(values.speed)
  if (speed !== undefined && !(speed > 0)) throw new UsageError('--speed takes a positive factor')
  const saved = readSavedTime(dir) ?? { wall: hostTime().source.now(), speed: 1 }
  const clock = createLabClock({ wall: saved.wall + skip, speed: speed ?? saved.speed })
  const persist = () => saveTime(dir, { wall: clock.time.source.now(), speed: clock.speed() })
  persist()
  const stopPersisting = every(hostTime().source, 1000, persist, { background: true })
  const control = createInterface({ input: process.stdin, terminal: false })
  const counted: ReadingsSource = { read: null }
  control.on('line', line => {
    if (line.trim() === '') return
    if (line.trim() === 'readings') return void recordWriter(storageLine(counted))
    const reply = answer(clock, line)
    persist()
    recordWriter({ kind: 'lab-time', ...reply })
  })
  recordWriter({ kind: 'lab-time', ok: true, command: 'start', ...readingOf(clock), fired: 0 })
  const { 'model-script': script, 'examiner-model': examiner, ...given } = values
  const model = await labModel(script, counted)
  try {
    const inputs = model.route(await serveInputs({ ...given, 'state-root': dir }))
    const stop = values['stop-on-stdin-close'] === true
    const plugins = {
      [LAB_PROGRAMS_ROW.plugin]: labProgramsRow,
      [LAB_READINGS_ROW.plugin]: labReadingsRow(counted),
    }
    return await serveUntilStopped(withLabRows(inputs, examiner), stop, {
      time: { source: clock.source, protocol: PROTOCOL },
      instance: 'lab',
      visibility: labVisibility,
      extraPlugins:
        examiner === undefined
          ? plugins
          : { ...plugins, [LAB_EXAMINER_ROW.plugin]: labExaminerRow(examiner) },
    })
  } finally {
    await model.close()
    control.close()
    stopPersisting()
    persist()
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0]
  try {
    if (command === 'setup') return claimed(labStateDir(undefined)) ? await setupCommand(argv) : 3
    if (command === 'serve') return await serve(argv.slice(1))
    throw new UsageError(`expected setup or serve, got ${command ?? 'nothing'}`)
  } catch (error) {
    if (error instanceof NotSetUpError) {
      process.stderr.write(
        `lab: not set up: ${error.message}\nRun \`harness-server-lab setup\` first.\n`,
      )
      return 2
    }
    if (
      error instanceof UsageError ||
      String((error as { code?: unknown }).code).startsWith('ERR_PARSE_ARGS')
    ) {
      process.stderr.write(`lab: ${(error as Error).message}\n${USAGE}\n`)
      return 2
    }
    process.stderr.write(
      `lab: internal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
    return 1
  }
}

await endProcess(await main(process.argv.slice(2)))
