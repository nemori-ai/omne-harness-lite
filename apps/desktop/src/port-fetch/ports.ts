import type { MessagePort } from 'node:worker_threads'

import type { PortMessage } from './protocol.ts'

export interface Port {
  postMessage(message: PortMessage): void
  onMessage(handler: (message: unknown) => void): () => void
  onClose(handler: () => void): () => void
  start?(): void
  close(): void
}

export function fromNodePort(port: MessagePort): Port {
  return {
    postMessage: message => port.postMessage(message),
    onMessage(handler) {
      port.on('message', handler)
      return () => port.off('message', handler)
    },
    onClose(handler) {
      port.on('close', handler)
      return () => port.off('close', handler)
    },
    start: () => port.start(),
    close: () => port.close(),
  }
}

export interface ElectronPortLike {
  postMessage(message: unknown): void
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown
  on(event: 'close', listener: () => void): unknown
  off(event: 'message', listener: (event: { data: unknown }) => void): unknown
  off(event: 'close', listener: () => void): unknown
  start(): void
  close(): void
}

export function fromElectronPort(port: ElectronPortLike): Port {
  return {
    postMessage: message => port.postMessage(message),
    onMessage(handler) {
      const listener = (event: { data: unknown }) => handler(event.data)
      port.on('message', listener)
      return () => port.off('message', listener)
    },
    onClose(handler) {
      port.on('close', handler)
      return () => port.off('close', handler)
    },
    start: () => port.start(),
    close: () => port.close(),
  }
}
