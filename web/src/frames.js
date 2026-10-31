// @ts-check
// What a board sends: binary frames and text lines, mixed in one byte stream
// (firmware/src/proto/frames.h). The same rules as the laptimer server's
// server/src/esp/frame.rs:
//
//   frame: A5 'R' | type | version | len (u16) | payload (len bytes) | crc32 (u32)
//
// All numbers little-endian; the CRC (zlib's CRC-32) covers everything before
// it. Text lines end in '\n' and never contain the byte 0xA5.
// GPL-3.0-or-later.

/** Frame type of FRAME_LEVEL_BATCH (the LEVELBATCH command). */
export const FRAME_LEVEL_BATCH = 7

const SYNC0 = 0xa5
const SYNC1 = 0x52 // 'R'
/** Header (6 bytes) and CRC (4 bytes) around the payload. */
const OVERHEAD = 10
/** More than this without a complete frame or line means we are lost. */
const MAX_BUFFER = 64 * 1024

/**
 * @typedef {{kind: 'frame', type: number, payload: Uint8Array} | {kind: 'line', text: string}} Item
 * @typedef {{t_us: number, id: number, flags: number, rssi: number, snr: number}} LevelEntry
 * @typedef {{seq: number, t0_us: number, lost: number, gain: number, mode: number, entries: LevelEntry[]}} LevelBatch
 */

/** @type {Uint32Array | null} */
let crcTable = null

/** zlib's CRC-32. @param {Uint8Array} data */
export function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Splits the byte stream into frames and lines. Feed it whatever the port
 * returned; it keeps incomplete data for the next call. */
export class Parser {
  constructor() {
    /** @type {Uint8Array} */
    this.buf = new Uint8Array(0)
    /** Frames thrown away because their CRC did not match. */
    this.crcErrors = 0
    this.decoder = new TextDecoder()
  }

  /** @param {Uint8Array} data @returns {Item[]} */
  push(data) {
    const joined = new Uint8Array(this.buf.length + data.length)
    joined.set(this.buf)
    joined.set(data, this.buf.length)
    const buf = joined
    /** @type {Item[]} */
    const out = []
    let pos = 0
    while (pos < buf.length) {
      if (buf[pos] === SYNC0) {
        if (buf.length - pos < 2) break // wait for the second sync byte
        if (buf[pos + 1] === SYNC1) {
          if (buf.length - pos < 6) break
          const len = buf[pos + 4] | (buf[pos + 5] << 8)
          const total = len + OVERHEAD
          if (buf.length - pos < total) break
          const end = pos + total
          const crc = (buf[end - 4] | (buf[end - 3] << 8) | (buf[end - 2] << 16) | (buf[end - 1] << 24)) >>> 0
          if (crc32(buf.subarray(pos, end - 4)) !== crc) {
            this.crcErrors++
            pos += 1 // skip the sync byte and look again
          } else {
            out.push({ kind: 'frame', type: buf[pos + 2], payload: buf.slice(pos + 6, pos + 6 + len) })
            pos = end
          }
          continue
        }
      }
      // Text up to '\n'. A 0xA5 before it: these bytes were not a line after
      // all (we started in the middle of something), drop them.
      let n = pos
      while (n < buf.length && buf[n] !== 0x0a && buf[n] !== SYNC0) n++
      if (n === buf.length) break // the rest of the line is still on its way
      if (buf[n] === SYNC0) {
        pos = Math.max(n, pos + 1)
        continue
      }
      const text = this.decoder.decode(buf.subarray(pos, n)).trim()
      if (text) out.push({ kind: 'line', text })
      pos = n + 1
    }
    this.buf = buf.slice(pos)
    if (this.buf.length > MAX_BUFFER) this.buf = new Uint8Array(0)
    return out
  }
}

/** The payload of a FRAME_LEVEL_BATCH: an 18-byte head, then 8 bytes per
 * entry. Returns null when the sizes don't add up.
 * @param {Uint8Array} p @returns {LevelBatch | null} */
export function parseLevelBatch(p) {
  if (p.length < 18) return null
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength)
  const n = v.getUint16(16, true)
  if (p.length < 18 + n * 8) return null
  const t0 = Number(v.getBigUint64(4, true))
  /** @type {LevelEntry[]} */
  const entries = []
  for (let i = 0; i < n; i++) {
    const o = 18 + i * 8
    entries.push({
      t_us: t0 + v.getUint32(o, true),
      id: p[o + 4],
      flags: p[o + 5],
      rssi: p[o + 6],
      snr: p[o + 7],
    })
  }
  return { seq: v.getUint32(0, true), t0_us: t0, lost: v.getUint16(12, true), gain: p[14], mode: p[15], entries }
}

/** Level code (0.25 dB steps) → dBFS. @param {number} code */
export const dbfs = (code) => code / 4 - 63.75
