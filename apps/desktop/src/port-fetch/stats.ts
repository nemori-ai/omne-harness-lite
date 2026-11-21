import type { PortMessage, PortMessageType } from './protocol.ts'

export interface PortStats {
  framesSent: Record<PortMessageType, number>
  framesReceived: Record<PortMessageType, number>
  ignoredFrames: number
  invalidFrames: number
  protocolErrors: number
  bodyBytesSent: number
  bodyBytesReceived: number
  acksCoalesced: number
  acksClamped: number
  acksWithheld: number
  creditWaitMs: number
  queuedBytes: number
  peakQueuedBytes: number
  activeRequests: number
  busyRejections: number
}

type Counted = Omit<PortStats, 'framesSent' | 'framesReceived' | 'activeRequests'>

export class Counters implements Counted {
  readonly sent = byType()
  readonly received = byType()
  ignoredFrames = 0
  invalidFrames = 0
  protocolErrors = 0
  bodyBytesSent = 0
  bodyBytesReceived = 0
  acksCoalesced = 0
  acksClamped = 0
  acksWithheld = 0
  creditWaitMs = 0
  queuedBytes = 0
  peakQueuedBytes = 0
  busyRejections = 0

  countSent(message: PortMessage): void {
    this.sent[message.type]++
    if (message.type === 'request-chunk' || message.type === 'response-chunk') {
      this.bodyBytesSent += message.chunk.byteLength
    }
  }

  countReceived(message: PortMessage): void {
    this.received[message.type]++
    if (message.type === 'request-chunk' || message.type === 'response-chunk') {
      this.bodyBytesReceived += message.chunk.byteLength
    }
  }

  snapshot(activeRequests: number): PortStats {
    return {
      framesSent: { ...this.sent },
      framesReceived: { ...this.received },
      ignoredFrames: this.ignoredFrames,
      invalidFrames: this.invalidFrames,
      protocolErrors: this.protocolErrors,
      bodyBytesSent: this.bodyBytesSent,
      bodyBytesReceived: this.bodyBytesReceived,
      acksCoalesced: this.acksCoalesced,
      acksClamped: this.acksClamped,
      acksWithheld: this.acksWithheld,
      creditWaitMs: Math.round(this.creditWaitMs * 1000) / 1000,
      queuedBytes: this.queuedBytes,
      peakQueuedBytes: this.peakQueuedBytes,
      activeRequests,
      busyRejections: this.busyRejections,
    }
  }
}

function byType(): Record<PortMessageType, number> {
  return {
    request: 0,
    'request-chunk': 0,
    'request-end': 0,
    response: 0,
    'response-chunk': 0,
    'response-end': 0,
    ack: 0,
    cancel: 0,
    error: 0,
  }
}
