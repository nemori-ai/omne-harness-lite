import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { verifyRedPng } from '../moonshot/repair-image.mjs'

const valid = readFileSync(new URL('../moonshot/valid-red-1x1.png', import.meta.url))
const old = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
)

test('Google fixture reuses a fully decoded and checksummed PNG', () => {
  assert.deepEqual(verifyRedPng(valid), {
    width: 1,
    height: 1,
    decodedBytes: 70,
    sha256: '49e1dad481e94dfab7c9573a9a81d56aa2ca629fe15a3f7a910aa4f47601c00d',
  })
  assert.equal(
    createHash('sha256').update(valid).digest('hex'),
    '49e1dad481e94dfab7c9573a9a81d56aa2ca629fe15a3f7a910aa4f47601c00d',
  )
})

test('the original Google tiny PNG was corrupt', () => {
  assert.throws(() => verifyRedPng(old), /IDAT CRC mismatch/)
})
