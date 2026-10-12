import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { verifyRedPng } from './repair-image.mjs'

const png = readFileSync(new URL('valid-red-1x1.png', import.meta.url))
const old = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
)

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function replaceIdat(data) {
  const ihdrEnd = 8 + 12 + 13
  const idat = Buffer.alloc(12 + data.length)
  idat.writeUInt32BE(data.length, 0)
  idat.write('IDAT', 4, 'ascii')
  data.copy(idat, 8)
  idat.writeUInt32BE(crc32(idat.subarray(4, 8 + data.length)), 8 + data.length)
  return Buffer.concat([png.subarray(0, ihdrEnd), idat, png.subarray(png.length - 12)])
}

test('PNG signature, each chunk CRC, zlib and exact 1x1 RGBA scanline pass', () => {
  assert.deepEqual(verifyRedPng(png), {
    width: 1,
    height: 1,
    decodedBytes: 70,
    sha256: '49e1dad481e94dfab7c9573a9a81d56aa2ca629fe15a3f7a910aa4f47601c00d',
  })
})

test('original fixture and representative corruptions fail for their actual reasons', () => {
  assert.throws(() => verifyRedPng(old), /IDAT CRC mismatch/)
  assert.throws(
    () => verifyRedPng(Buffer.concat([Buffer.from('not-png'), png.subarray(7)])),
    /signature/,
  )
  const crcBad = Buffer.from(png)
  crcBad[45] ^= 1
  assert.throws(() => verifyRedPng(crcBad), /IDAT CRC mismatch/)
  const zlibBad = Buffer.from(png.subarray(41, png.length - 16))
  zlibBad[zlibBad.length - 1] ^= 1
  assert.throws(() => verifyRedPng(replaceIdat(zlibBad)), /incorrect data check/)
  assert.throws(
    () => verifyRedPng(replaceIdat(deflateSync(Buffer.from([0, 255, 0, 0])))),
    /PNG scanline, filter, or pixel mismatch/,
  )
})
