// The negative controls of the explorer and of the line cases: one defect each, put into `src/`
// as a text replacement, that the named case must catch. `mutate.ts` applies one, runs the case,
// and restores the source byte for byte. Each entry names the property it proves can go red and
// the signature (explorer) or case (vitest) expected to show it. A defect listed here with more
// than one replacement needs every one of them: the property is held at more than one place.

export type Replacement = Readonly<{
  /** The exact text to replace; it must occur `occurrences` times (default 1) in the file. */
  find: string
  replace: string
  occurrences?: number
}>

export type Mutant = Readonly<{
  name: string
  /** The property or clause the defect breaks. */
  breaks: string
  /** What the defect is, in one sentence. */
  defect: string
  file: 'src/session.ts' | 'src/stdio-line.ts'
  replacements: readonly Replacement[]
  /** The spec file to run, relative to the package root. */
  spec: string
  /** The vitest tier the case lives in. */
  mode: 'fast' | 'slow'
  /** The `-t` filter that selects the case. */
  filter: string
  /** The text the red run must show: a violation signature, or the failing assertion. */
  expect: string
}>

const EXPLORER = 'tests/model/session-model.spec.ts'
const LINES = 'tests/lines.spec.ts'

export const MUTANTS: readonly Mutant[] = [
  {
    name: 'mV2-forgets-close',
    breaks: 'V2',
    defect:
      'the session forgets that it closed: `usable` ignores `closed`, and the credential handle is called after close() (two guards)',
    file: 'src/session.ts',
    replacements: [
      {
        find: '    return !this.closed && this.dead === undefined\n',
        replace: '    return this.dead === undefined\n',
      },
      {
        find: '    if (this.closed) return Promise.resolve(undefined)\n',
        replace: '',
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'http-bare|http-call',
    expect: 'V2-authorize-after-close',
  },
  {
    name: 'mV3-report-twice',
    breaks: 'V3',
    defect: '`reportRejection` is called twice for one refusal',
    file: 'src/session.ts',
    replacements: [
      {
        find: '        ? this.callHandle(() => credential.reportRejection())\n',
        replace:
          '        ? this.callHandle(() => credential.reportRejection().then(() => credential.reportRejection()))\n',
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'http-call',
    expect: 'V3-more-than-refusals',
  },
  {
    name: 'mV4-signal-dead',
    breaks: 'V4',
    defect: "the call's signal does nothing: the request in flight is not stopped",
    file: 'src/session.ts',
    replacements: [
      {
        find: '    const onAbort = () => this.stop(entry)\n',
        replace: '    const onAbort = () => undefined\n',
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'minimal',
    expect: 'V4-unsettled-call',
  },
  {
    name: 'mV4-close-settles-after-line',
    breaks: 'V4',
    defect:
      'close() settles the requests in flight only once the line closed: a line that hangs holds every caller',
    file: 'src/session.ts',
    replacements: [
      {
        find: '      for (const entry of this.pending.values()) this.stop(entry)\n      this.teardown.abort()\n      this.closing = this.line.close()\n',
        replace:
          '      this.closing = this.line.close().then(() => {\n        for (const entry of this.pending.values()) this.stop(entry)\n        this.teardown.abort()\n      })\n',
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'minimal',
    expect: 'V4-unsettled-call',
  },
  {
    name: 'mV4-caller-follows-workflow',
    breaks: 'V4',
    defect:
      'the caller waits on the workflow instead of the settlement: `begin` awaits the authorization and the write, `once` and `call` await `begin`',
    file: 'src/session.ts',
    replacements: [
      {
        find: '  private begin(method: RequestMethod, params: PlainRecord, sending: Sending): Pending | undefined {\n',
        replace:
          '  private async begin(method: RequestMethod, params: PlainRecord, sending: Sending): Promise<Pending | undefined> {\n',
      },
      {
        find: '    this.work(() => this.sendOut(entry, method, params, sending), entry)\n    return entry\n',
        replace: '    await this.sendOut(entry, method, params, sending)\n    return entry\n',
      },
      {
        find: '    const entry = this.begin(method, params, sending)\n',
        replace: '    const entry = await this.begin(method, params, sending)\n',
      },
      {
        find: '    const entry = this.begin(composed.method, composed.params, {\n',
        replace: '    const entry = await this.begin(composed.method, composed.params, {\n',
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'minimal',
    expect: 'V4-unsettled-call-authorizing',
  },
  {
    name: 'mV5-resend-any',
    breaks: 'V5',
    defect: 'every `no-answer` is sent once more, a write request too',
    file: 'src/session.ts',
    replacements: [
      {
        find: '    return withOneResend(() => this.once(method, params, sending))\n',
        replace:
          "    return this.once(method, params, sending).then(first =>\n      first.wire.kind === 'no-answer' ? this.once(method, params, sending) : first,\n    )\n",
      },
    ],
    spec: EXPLORER,
    mode: 'slow',
    filter: 'http-resend',
    expect: 'V5-write-resent',
  },
  {
    name: 'mV6-close-not-sent',
    breaks: 'V6',
    defect:
      'a request handed to the line is answered `not-sent` by close() or the signal, not `abandoned`',
    file: 'src/session.ts',
    replacements: [
      {
        find: "      case 'sent':\n        return { wire: ABANDONED }\n",
        replace: "      case 'sent':\n        return NOT_SENT\n",
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'http-call',
    expect: 'V6-sent',
  },
  {
    name: 'mV6-authorizing-abandoned',
    breaks: 'V6',
    defect:
      'a request still authorizing is answered `abandoned` by the signal: a SentCall for a request the peer never saw (the defect of T5 before this ruling)',
    file: 'src/session.ts',
    replacements: [
      {
        find: "      case 'authorizing':\n        return NOT_SENT\n",
        replace: "      case 'authorizing':\n        return { wire: ABANDONED }\n",
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'minimal',
    expect: 'V6-authorizing',
  },
  {
    name: 'mStdio-writes-boolean',
    breaks: 'SPEC H6',
    defect:
      'the writes in flight are a boolean again: the first write to complete hides the one still in flight',
    file: 'src/stdio-line.ts',
    replacements: [
      { find: '    this.writes += 1\n', replace: '    this.writes = 1\n' },
      { find: '        this.writes -= 1\n', replace: '        this.writes = 0\n', occurrences: 2 },
    ],
    spec: LINES,
    mode: 'fast',
    filter: 'two overlapping writes',
    expect: "expected 'pending' to deeply equal { settled: undefined }",
  },
  {
    name: 'mStdio-no-cross-chunk-bound',
    breaks: 'SPEC H8',
    defect:
      'a line in progress is measured only at a newline: one that never ends grows the read buffer without bound',
    file: 'src/stdio-line.ts',
    replacements: [
      {
        find: '        if (pendingBytes > BYTE_LIMIT) {\n          broken = true\n          break\n        }\n',
        replace: '',
      },
    ],
    spec: LINES,
    mode: 'fast',
    filter: 'spans many chunks',
    expect: "expected 'pending' to deeply equal",
  },
  {
    name: 'mStdio-failed-write-sent',
    breaks: 'T8 X02',
    defect: 'a write the process rejected is reported as sent',
    file: 'src/stdio-line.ts',
    replacements: [
      {
        find: "        case 'failed':\n          this.writable = false\n          return { kind: 'unsent' }\n",
        replace: "        case 'failed':\n          return { kind: 'sent' }\n",
      },
    ],
    spec: LINES,
    mode: 'fast',
    filter: 'a write the process rejects is unsent',
    expect: "expected { kind: 'sent' } to deeply equal { kind: 'unsent' }",
  },
  {
    name: 'mStdio-drops-tail',
    breaks: 'T2',
    defect: 'the last line of stdout, ended without a newline, is dropped',
    file: 'src/stdio-line.ts',
    replacements: [
      {
        find: "      if (!broken && tail !== '') this.deliver(tail)\n",
        replace: "      if (!broken && tail !== '') void tail\n",
      },
    ],
    spec: LINES,
    mode: 'fast',
    filter: 'the last line of stdout is delivered',
    expect: '-       "text": "{\\"last\\":2}",\n+       "kind": "ended",',
  },
]
