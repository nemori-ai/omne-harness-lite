import { readJsonStrict, writeJsonLossless, isJsonNumber, jsonNumberSource } from '../../packages/core/content-blocks/dist/index.js'

const samples = ['9007199254740993', '12345678901234567890', '0.1', '1.10', '1e400', '-0']
const rows = samples.map(source => {
  let nativeSource
  const native = JSON.parse(source, (_key, value, context) => {
    if (typeof value === 'number') {
      nativeSource = context.source
      return JSON.rawJSON(context.source)
    }
    return value
  })
  const parsed = readJsonStrict(source)
  if (!('ok' in parsed) || !isJsonNumber(parsed.ok)) throw new Error(`failed ${source}`)
  const written = writeJsonLossless(parsed.ok)
  if (written !== source || JSON.stringify(native) !== source || nativeSource !== source) throw new Error(`lost ${source}`)
  return { source, nativeSource, nativeRoundTrip: JSON.stringify(native), publicSource: jsonNumberSource(parsed.ok), publicRoundTrip: written }
})
process.stdout.write(JSON.stringify({ node: process.version, v8: process.versions.v8, rows }, null, 2) + '\n')
