import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { Input, TuiMainScreen, Text, CURSOR_MARKER } from '@earendil-works/pi-tui'
class Terminal {
  columns = 80; rows = 24; kittyProtocolActive = false; output = ''; input; resize
  start(input, resize) { this.input = input; this.resize = resize }
  stop() {}
  async drainInput() {}
  write(value) { this.output += value }
  moveBy() {} hideCursor() {} showCursor() {} clearLine() {} clearFromCursor() {} clearScreen() {} setTitle() {} setProgress() {}
}
const terminal = new Terminal()
const tui = new TuiMainScreen(terminal, true)
const field = new Input({ prompt: '组织：' })
tui.addChild(new Text('中心：fixture · 账号：fixture'))
tui.addChild(field); tui.setFocus(field); tui.start(); tui.renderNow()
const before = performance.now()
const paste = '中文abc'.repeat(1000)
terminal.input('\x1b[200~' + paste + '\x1b[201~')
tui.renderNow()
assert.equal(field.getValue(), paste)
assert(!terminal.output.includes(CURSOR_MARKER))
assert.equal(field.render(80).length, 1)
terminal.columns = 38; terminal.resize(); tui.renderNow()
assert.equal(field.getValue(), paste)
tui.stop()
console.log(JSON.stringify({ node: process.version, platform: process.platform, version: '0.86.1', unicodeScalars: Array.from(paste).length, renderMilliseconds: performance.now() - before, outputBytes: Buffer.byteLength(terminal.output), scope: 'synthetic Terminal, no IME or actual PTY claim' }))
const injected = new Input()
injected.handleInput('\x1b[200~\x1b]52;c;UFI=\x07\x1b[201~')
assert(injected.render(80).join('').includes('\x1b]52;'))
console.log('OBSERVED: raw Input paste can retain OSC control bytes; application-owned input/output boundary must account for it')
