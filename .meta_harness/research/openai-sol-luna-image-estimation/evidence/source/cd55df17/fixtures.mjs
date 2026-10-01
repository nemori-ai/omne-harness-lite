import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
export const images = Object.freeze(Object.fromEntries(['64x64', '256x32', '65x65', '1024x1024', '2049x2903'].map(name => {
  const bytes = readFileSync(new URL(`./images/${name}.png`, import.meta.url))
  const [width, height] = name.split('x').map(Number)
  return [name, Object.freeze({ width, height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64'), url: `data:image/png;base64,${bytes.toString('base64')}` })]
})))
export const cases = Object.freeze({ offgrid: ['65x65'], square1024: ['1024x1024'], large: ['2049x2903'], pair: ['64x64', '256x32'] })
export const imageHashes = gate => Object.fromEntries(cases[gate].map(name => [name, images[name].sha256]))
