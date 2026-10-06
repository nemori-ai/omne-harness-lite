import {
  captureCommandRequest,
  captureEnvironmentFacilities,
  isCommandProcess,
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
              (chunk.stream !== 'stdout' && chunk.stream !== 'stderr') ||
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
  const exposed: EnvironmentFacilities = Object.freeze({
    description: facilities.description,
    ...(command
      ? {
          command: Object.freeze({
            async start(request: Parameters<typeof command.start>[0]) {
              const copied = captureCommandRequest(request)
              if (!copied) return failure('invalidInput')
              return input.observe(async () => {
                const granted = await gate('command')
                if (granted.kind === 'rejected') return granted
                try {
                  const result = await command.start(copied)
                  if (result.kind !== 'started') return result
                  return isCommandProcess(result.process)
                    ? ({ kind: 'started', process: processView(result.process) } as const)
                    : failure('effectUnknown')
                } catch {
                  return failure('effectUnknown')
                }
              })
            },
          }),
        }
      : {}),
    ...(files
      ? {
          files: Object.freeze({
            async read(path: string) {
              if (typeof path !== 'string' || !path) return failure('invalidInput')
              return input.observe(async () => {
                const granted = await gate('files')
                if (granted.kind === 'rejected') return granted
                try {
                  const result = await files.read(path)
                  return result.kind === 'read'
                    ? result.data instanceof Uint8Array
                      ? ({ kind: 'read', data: new Uint8Array(result.data) } as const)
                      : failure('effectUnknown')
                    : result
                } catch {
                  return failure('effectUnknown')
                }
              })
            },
            async write(path: string, data: Uint8Array) {
              if (typeof path !== 'string' || !path || !(data instanceof Uint8Array))
                return failure('invalidInput')
              let copied: Uint8Array
              try {
                copied = new Uint8Array(data)
              } catch {
                return failure('invalidInput')
              }
              return input.observe(async () => {
                const granted = await gate('files')
                if (granted.kind === 'rejected') return granted
                try {
                  return await files.write(path, copied)
                } catch {
                  return failure('effectUnknown')
                }
              })
            },
          }),
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
