// @ts-check
// A board on this computer's USB, over Web Serial: send command lines, get
// text lines and frames back (frames.js). Close it before flashing: the
// flasher opens the port itself.
// GPL-3.0-or-later. The read loop follows widscan58's
// web/src/serial/device.ts (CapnBry/widscan58).

import { Parser } from './frames.js'

/**
 * @typedef {object} LinkEvents
 * @property {(text: string) => void} line
 * @property {(type: number, payload: Uint8Array) => void} frame
 * @property {(why: string) => void} closed   not called for close()
 */

/** Line conditions after which Web Serial gives a new readable stream. */
const RECOVERABLE = new Set(['BreakError', 'FramingError', 'ParityError', 'BufferOverrunError'])

export class BoardLink {
  /** @param {SerialPort} port @param {LinkEvents} ev */
  constructor(port, ev) {
    this.port = port
    this.ev = ev
    this.parser = new Parser()
    this.closing = false
    /** @type {ReadableStreamDefaultReader<Uint8Array> | null} */
    this.reader = null
    /** @type {Promise<void>} */
    this.readDone = Promise.resolve()
    /** Held from open() to close(): two sends must not race for the lock
     * (a reply can arrive before the previous write() has finished).
     * @type {WritableStreamDefaultWriter<Uint8Array> | null} */
    this.writer = null
    /** Waiting query() calls; every line goes to each until one takes it.
     * @type {Set<(line: string) => boolean>} */
    this.waiting = new Set()
  }

  async open() {
    // USB Serial/JTAG ignores the baud rate; a large buffer absorbs bursts.
    await this.port.open({ baudRate: 115200, bufferSize: 1 << 20 })
    this.writer = this.port.writable?.getWriter() ?? null
    this.closing = false
    this.readDone = this.readLoop()
  }

  async readLoop() {
    const port = this.port
    while (port.readable && !this.closing) {
      this.reader = port.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (value) this.take(value)
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        if (!RECOVERABLE.has(err.name)) {
          this.reader.releaseLock()
          this.writer?.releaseLock()
          this.writer = null
          await port.close().catch(() => {})
          this.ev.closed(
            err.name === 'NetworkError'
              ? 'Verbindung verloren (Board abgezogen oder neu gestartet?)'
              : `Lesefehler: ${err.name}: ${err.message}`,
          )
          return
        }
      } finally {
        try {
          this.reader.releaseLock()
        } catch {
          /* already released */
        }
      }
    }
    if (!this.closing) this.ev.closed('Verbindung beendet')
  }

  /** @param {Uint8Array} bytes */
  take(bytes) {
    for (const item of this.parser.push(bytes)) {
      if (item.kind === 'frame') {
        this.ev.frame(item.type, item.payload)
        continue
      }
      for (const w of this.waiting) if (w(item.text)) break
      this.ev.line(item.text)
    }
  }

  /** Sends one command line. @param {string} line */
  async send(line) {
    if (!this.writer) throw new Error('Port nicht offen')
    await this.writer.write(new TextEncoder().encode(line + '\n'))
  }

  /**
   * Sends `line` and waits for the reply: the first line starting with
   * `prefix`, or an "ERR …" (thrown). Null after `timeoutMs` without one.
   * @param {string} line @param {string} prefix @param {number} [timeoutMs]
   * @returns {Promise<string | null>}
   */
  query(line, prefix, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      /** @param {string} text */
      const w = (text) => {
        if (text.startsWith(prefix)) {
          done()
          resolve(text)
          return true
        }
        if (text.startsWith('ERR')) {
          done()
          reject(new Error(text))
          return true
        }
        return false
      }
      const timer = setTimeout(() => {
        done()
        resolve(null)
      }, timeoutMs)
      const done = () => {
        clearTimeout(timer)
        this.waiting.delete(w)
      }
      this.waiting.add(w)
      this.send(line).catch((e) => {
        done()
        reject(e)
      })
    })
  }

  async close() {
    this.closing = true
    try {
      await this.reader?.cancel()
    } catch {
      /* already closed */
    }
    // port.close() rejects while the read loop still holds the reader lock.
    await this.readDone
    this.writer?.releaseLock()
    this.writer = null
    await this.port.close().catch(() => {})
  }
}
