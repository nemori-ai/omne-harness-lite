import type { JsonValue } from '@omne-harness/json-text'

export type UserMessage = Extract<JsonValue, { readonly kind: 'object' }>

const ROUND = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const START = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const

const rotate = (value: number, by: number): number => (value >>> by) | (value << (32 - by))

function padded(bytes: Uint8Array): DataView {
  const length = Math.ceil((bytes.length + 9) / 64) * 64
  const block = new Uint8Array(length)
  block.set(bytes)
  block[bytes.length] = 0x80
  const view = new DataView(block.buffer)
  const bits = bytes.length * 8
  view.setUint32(length - 8, Math.floor(bits / 0x1_0000_0000))
  view.setUint32(length - 4, bits >>> 0)
  return view
}

function schedule(view: DataView, offset: number, words: Uint32Array): void {
  for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4)
  for (let i = 16; i < 64; i += 1) {
    const early = words[i - 15]!
    const late = words[i - 2]!
    const s0 = rotate(early, 7) ^ rotate(early, 18) ^ (early >>> 3)
    const s1 = rotate(late, 17) ^ rotate(late, 19) ^ (late >>> 10)
    words[i] = words[i - 16]! + s0 + words[i - 7]! + s1
  }
}

function compress(state: Uint32Array, words: Uint32Array): void {
  let [a, b, c, d, e, f, g, h] = state as unknown as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  for (let i = 0; i < 64; i += 1) {
    const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)
    const choice = (e & f) ^ (~e & g)
    const first = (h + s1 + choice + ROUND[i]! + words[i]!) | 0
    const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)
    const majority = (a & b) ^ (a & c) ^ (b & c)
    const second = (s0 + majority) | 0
    h = g
    g = f
    f = e
    e = (d + first) | 0
    d = c
    c = b
    b = a
    a = (first + second) | 0
  }
  const next = [a, b, c, d, e, f, g, h]
  for (let i = 0; i < 8; i += 1) state[i] = state[i]! + next[i]!
}

function sha256(bytes: Uint8Array): Uint8Array {
  const view = padded(bytes)
  const state = Uint32Array.from(START)
  const words = new Uint32Array(64)
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    schedule(view, offset, words)
    compress(state, words)
  }
  const digest = new Uint8Array(32)
  const out = new DataView(digest.buffer)
  for (let i = 0; i < 8; i += 1) out.setUint32(i * 4, state[i]!)
  return digest
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function base64url(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const count = Math.min(bytes.length - i, 3) + 1
    for (let j = 0; j < count; j += 1) text += ALPHABET[(chunk >>> (18 - j * 6)) & 63]
  }
  return text
}

type Node = UserMessage['entries'][number]['value']

const string = (value: string): Node => ({ kind: 'string', value })
const boolean = (value: boolean): Node => ({ kind: 'boolean', value })
const object = (entries: readonly (readonly [string, Node])[]): UserMessage => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

export function userTextMessage(text: string, inputId: string): UserMessage {
  const digest = base64url(sha256(new TextEncoder().encode(inputId)))
  return object([
    ['id', string(`msg_${digest}`)],
    ['role', string('user')],
    [
      'blocks',
      {
        kind: 'array',
        items: [
          object([
            ['kind', string('text')],
            ['id', string(`blk_${digest}`)],
            [
              'visibility',
              object([
                ['toHuman', boolean(true)],
                ['toModel', boolean(true)],
              ]),
            ],
            ['text', string(text)],
          ]),
        ],
      },
    ],
  ])
}
