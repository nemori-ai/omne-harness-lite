// The negative controls of the explorer, of the line cases and of the cases on real wires: one
// defect each, put into `src/` as a text replacement, that the named case must catch. `mutate.ts`
// applies one, runs the case, and restores the source byte for byte. Each entry names the
// property or clause it proves can go red and the signature (explorer) or case (vitest) expected
// to show it. A defect listed here with more than one replacement needs every one of them: the
// property is held at more than one place. A slow-tier case imports the package through `dist`:
// `mutate.ts` builds the package for it.

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
  file: 'src/session.ts' | 'src/stdio-line.ts' | 'src/http-line.ts'
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
const SESSION = 'tests/session.spec.ts'
const LINES = 'tests/lines.spec.ts'
const STDIO = 'tests/stdio.spec.ts'
const HTTP = 'tests/http.spec.ts'

export const MUTANTS: readonly Mutant[] = [
  {
    name: 'mV1-sends-after-settled',
    breaks: 'V1',
    defect:
      'a request stopped while it was authorized still goes out: `sendOut` does not check that the entry is in flight once `authorize` answered',
    file: 'src/session.ts',
    replacements: [
      {
        find: '    if (!(await this.authorize(headers))) return this.settle(entry, NOT_SENT)\n    if (!this.inFlight(entry)) return\n',
        replace: '    if (!(await this.authorize(headers))) return this.settle(entry, NOT_SENT)\n',
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'minimal',
    expect: 'V1-line.send-after-settle',
  },
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
        find: '        : this.callHandle(() => credential.reportRejection())\n',
        replace:
          '        : this.callHandle(() => credential.reportRejection().then(() => credential.reportRejection()))\n',
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
      "a request handed to the line is answered `not-sent` by close() or the signal, not `abandoned`: the session does not use the contract's rule for the `sent` phase",
    file: 'src/session.ts',
    replacements: [
      {
        find: '        : { wire: stopAnswerOf(phase) },\n',
        replace:
          "        : { wire: phase.kind === 'sent' ? NOT_SENT.wire : stopAnswerOf(phase) },\n",
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
        find: '        : { wire: stopAnswerOf(phase) },\n',
        replace:
          "        : { wire: phase.kind === 'authorizing' ? { kind: 'no-answer', cause: 'abandoned', resend: false } : stopAnswerOf(phase) },\n",
      },
    ],
    spec: EXPLORER,
    mode: 'fast',
    filter: 'minimal',
    expect: 'V6-authorizing',
  },
  {
    name: 'mB1-session-ended-skips-authorizing',
    breaks: 'V6',
    defect:
      'the session ending (S07) does not settle the requests still authorizing: one of them goes out on a transport that is not usable any more (the defect B1 of the third review)',
    file: 'src/session.ts',
    replacements: [
      {
        find: '      const wire = lineGoneAnswerOf(entry.phase, cause)\n',
        replace:
          "      const wire = cause === 'session-ended' ? undefined : lineGoneAnswerOf(entry.phase, cause)\n",
      },
    ],
    spec: SESSION,
    mode: 'fast',
    filter: 'still being authorized when the session ended',
    expect:
      'expected { settled: { ok: { …(2) } } } to deeply equal { settled: { failure: { …(2) } } }',
  },
  {
    name: 'mV6-lineend-keeps-authorizing',
    breaks: 'V6',
    defect:
      'the line going away does not settle a request still authorizing: it goes out later on a line that is gone',
    file: 'src/session.ts',
    replacements: [
      {
        find: '      const wire = lineGoneAnswerOf(entry.phase, cause)\n',
        replace:
          "      const wire = entry.phase.kind === 'authorizing' ? undefined : lineGoneAnswerOf(entry.phase, cause)\n",
      },
    ],
    spec: EXPLORER,
    mode: 'slow',
    filter: 'sse-fallback',
    expect: 'V6-lineend-authorizing',
  },
  {
    name: 'mV6-lineend-settles-discovery',
    breaks: 'V6, T8',
    defect:
      'the line going away settles a request in the authorization discovery with what was fetched so far, as a stop would',
    file: 'src/session.ts',
    replacements: [
      {
        find: '      const wire = lineGoneAnswerOf(entry.phase, cause)\n',
        replace: '      const wire = stopAnswerOf(entry.phase)\n',
      },
    ],
    spec: SESSION,
    mode: 'fast',
    filter: 'is not settled by the shared stream breaking',
    expect: "to be 'pending'",
  },
  {
    name: 'mStdio-close-flushes',
    breaks: 'SPEC H6',
    defect:
      'close() closes the write end instead of aborting it: the bytes a peer never reads have to drain first, so close() waits for the peer',
    file: 'src/stdio-line.ts',
    replacements: [
      {
        find: "    void this.writer.abort(new Error('the line closed')).catch(() => undefined)\n",
        replace: '    await this.writer.close().catch(() => undefined)\n',
      },
    ],
    spec: STDIO,
    mode: 'slow',
    filter: 'small calls that departed',
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
  {
    name: 'mHttp-reset-is-unsent',
    breaks: 'SPEC H10, T8 X01',
    defect: 'a reset before the answer head is read as a request that never left',
    file: 'src/http-line.ts',
    replacements: [
      {
        find: "  'UND_ERR_CONNECT_TIMEOUT',\n",
        replace: "  'UND_ERR_CONNECT_TIMEOUT',\n  'UND_ERR_SOCKET',\n",
      },
    ],
    spec: HTTP,
    mode: 'slow',
    filter: 'a connection refused is not-sent',
    expect: "expected { failure: { kind: 'not-sent', …(1) } } to deeply equal",
  },
  {
    name: 'mHttp-refused-is-broken',
    breaks: 'SPEC H10, T8 X01',
    defect: 'a connection refused is read as a broken stream: a request that never left is re-sent',
    file: 'src/http-line.ts',
    replacements: [{ find: "  'ECONNREFUSED',\n", replace: '' }],
    spec: HTTP,
    mode: 'slow',
    filter: 'a connection refused is not-sent',
    expect: "to deeply equal { failure: { kind: 'not-sent', …(1) } }",
  },
  {
    name: 'mHttp-follows-redirect',
    breaks: 'SPEC H11, contract「不跟随重定向」',
    defect: 'the line follows a redirect: a request reaches a target the caller did not name',
    file: 'src/http-line.ts',
    replacements: [
      {
        find: "        redirect: 'manual',\n",
        replace: "        redirect: 'follow',\n",
        occurrences: 2,
      },
    ],
    spec: HTTP,
    mode: 'slow',
    filter: 'a redirect is not followed',
    expect: "to deeply equal { failure: { kind: 'not-sent', …(1) } }",
  },
  {
    name: 'mHttp-sse-endpoint-forgotten',
    breaks: 'SPEC H9, T3',
    defect:
      'entering the SSE mode does not keep the endpoint: the requests keep posting to the target',
    file: 'src/http-line.ts',
    replacements: [{ find: '        this.endpoint = endpoint\n', replace: '' }],
    spec: HTTP,
    mode: 'slow',
    filter: 'the reference server in its sse mode',
    expect: 'discover failed:',
  },
  {
    name: 'mHttp-reads-every-sse-event',
    breaks: 'T2',
    defect: 'every event of a 2xx SSE body is read as a message, whatever its event type',
    file: 'src/http-line.ts',
    replacements: [
      {
        find: "    if (event.event === undefined || event.event === 'message') yield event.data\n",
        replace: '    yield event.data\n',
      },
    ],
    spec: HTTP,
    mode: 'slow',
    filter: 'first event is not a message event',
    expect: '"what": "tools-missing"',
  },
  {
    name: 'mHttp-get-status-as-stream',
    breaks: 'SPEC H9, T3, T8 S05',
    defect:
      'a fallback GET answered with an error status is reported as a stream: the refusal is never seen',
    file: 'src/http-line.ts',
    replacements: [
      {
        find: '    if (response.status < 200 || response.status >= 300) {\n',
        replace: '    if (response.status < 0) {\n',
      },
    ],
    spec: HTTP,
    mode: 'slow',
    filter: 'the fallback GET refused with 401',
    expect: '"cause": "connection-unavailable"',
  },
  {
    name: 'mHttp-get-without-events',
    breaks: 'SPEC H9, T3',
    defect:
      'the events of a 2xx fallback GET are never read: the endpoint never comes, the fallback never holds',
    file: 'src/http-line.ts',
    replacements: [
      {
        find: "      mediaTypeOf(response) === 'text/event-stream' && response.body !== null\n",
        replace: "      mediaTypeOf(response) !== 'text/event-stream' && response.body !== null\n",
      },
    ],
    spec: HTTP,
    mode: 'slow',
    filter: 'after initialize is refused with a plain 4xx, the GET stream and its endpoint carry',
    expect: 'discover failed:',
  },
]
