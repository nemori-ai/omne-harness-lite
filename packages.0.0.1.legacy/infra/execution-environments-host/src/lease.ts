import {
  captureCommandArguments,
  captureFileArguments,
  captureFileResult,
  captureCommandResult,
  commandFacilityMethods,
  fileFacilityMethods,
  type CommandFacility,
  type FileFacility,
  captureEnvironmentFacilities,
  type EnvironmentFacilities,
  type EnvironmentLease,
  type FacilityFailure,
  type ProcessHandle,
  type CommandOutput,
} from '@omne-harness-lite/execution-environments'

const failure = (reason: FacilityFailure['reason']): FacilityFailure => ({
  kind: 'rejected',
  reason,
})
function processView(process: ProcessHandle): ProcessHandle {
  const outputMode = process.outputMode
  let readerClaimed = false
  const iterator = process.output[Symbol.asyncIterator].bind(process.output)
  const output: AsyncIterable<CommandOutput> = {
    [Symbol.asyncIterator]() {
      if (readerClaimed) throw new Error('command output reader already claimed')
      readerClaimed = true
      const source = iterator()
      return (async function* () {
        try {
          for (;;) {
            const next = await source.next()
            if (next.done) return
            const chunk = next.value
            if (
              !(outputMode === 'terminal'
                ? chunk.stream === 'terminal'
                : chunk.stream === 'stdout' || chunk.stream === 'stderr') ||
              !(chunk.data instanceof Uint8Array)
            )
              throw new TypeError('invalid command output')
            yield Object.freeze({ stream: chunk.stream, data: new Uint8Array(chunk.data) })
          }
        } finally {
          await source.return?.()
        }
      })()
    },
  }
  return Object.freeze({
    outputMode,
    output: Object.freeze(output),
    outputPolicy: Object.freeze({ ...process.outputPolicy }),
    result: process.result,
    stop: process.stop.bind(process),
  })
}
/** Wraps new effects only. Original process output, result and stop keep their owner. */
export function createLeaseView(input: {
  readonly lease: EnvironmentLease
  readonly available: () => boolean
  readonly authorize: (
    facility: 'command' | 'files',
  ) => Promise<{ readonly kind: 'authorized' } | FacilityFailure>
  readonly observe: <T>(operation: () => Promise<T>) => Promise<T>
}): EnvironmentLease | undefined {
  const facilities = captureEnvironmentFacilities(input.lease.facilities)
  if (
    !facilities ||
    typeof input.lease.release !== 'function' ||
    !(input.lease.invalidated instanceof Promise)
  )
    return undefined
  let held = true
  const invalidated = input.lease.invalidated.then(
    value => {
      held = false
      return value
    },
    () => {
      held = false
      return { reason: 'providerUnavailable' }
    },
  )
  async function gate(facility: 'command' | 'files') {
    if (!held || !input.available()) return failure('closed')
    const result = await input.authorize(facility)
    if (result.kind === 'rejected') return result
    return held && input.available() ? result : failure('closed')
  }
  const command = facilities.command,
    files = facilities.files
  function commandPort<M extends keyof CommandFacility>(method: M): CommandFacility[M] {
    return (async (...args: Parameters<CommandFacility[M]>) => {
      const copied = captureCommandArguments(method, args)
      if (!copied) return failure('invalidInput')
      return input.observe(async () => {
        const granted = await gate('command')
        if (granted.kind === 'rejected') return granted
        try {
          const raw: unknown = await Reflect.apply(command![method], command, copied)
          const result = captureCommandResult(method, raw)
          if (!result) return failure('effectUnknown')
          return result.kind === 'started'
            ? { kind: 'started', process: processView(result.process) }
            : result
        } catch {
          return failure('effectUnknown')
        }
      })
    }) as CommandFacility[M]
  }
  function filePort<M extends keyof FileFacility>(method: M): FileFacility[M] {
    return (async (...args: Parameters<FileFacility[M]>) => {
      const copied = captureFileArguments(method, args)
      if (!copied) return failure('invalidInput')
      return input.observe(async () => {
        const granted = await gate('files')
        if (granted.kind === 'rejected') return granted
        try {
          const raw: unknown = await Reflect.apply(files![method], files, copied)
          return captureFileResult(method, raw) ?? failure('effectUnknown')
        } catch {
          return failure('effectUnknown')
        }
      })
    }) as FileFacility[M]
  }
  const exposed: EnvironmentFacilities = Object.freeze({
    description: facilities.description,
    ...(command
      ? {
          command: Object.freeze(
            Object.fromEntries(commandFacilityMethods.map(method => [method, commandPort(method)])),
          ) as unknown as CommandFacility,
        }
      : {}),
    ...(files
      ? {
          files: Object.freeze(
            Object.fromEntries(fileFacilityMethods.map(method => [method, filePort(method)])),
          ) as unknown as FileFacility,
        }
      : {}),
  })
  return Object.freeze({
    facilities: exposed,
    invalidated,
    release() {
      held = false
      return input.lease.release()
    },
  })
}
