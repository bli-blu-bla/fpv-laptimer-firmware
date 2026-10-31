// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_LEVEL_BATCH, Parser, crc32, dbfs, parseLevelBatch } from './frames.js'

/** @param {number} type @param {Uint8Array} payload */
function frame(type, payload) {
  const f = new Uint8Array(payload.length + 10)
  f.set([0xa5, 0x52, type, 1, payload.length & 0xff, payload.length >> 8])
  f.set(payload, 6)
  new DataView(f.buffer).setUint32(6 + payload.length, crc32(f.subarray(0, 6 + payload.length)), true)
  return f
}

const text = (/** @type {string} */ s) => new TextEncoder().encode(s)

test('crc32 like zlib', () => {
  assert.equal(crc32(text('123456789')), 0xcbf43926)
})

test('lines and frames, split anywhere', () => {
  const batch = new Uint8Array(18 + 8)
  const v = new DataView(batch.buffer)
  v.setUint32(0, 7, true)
  v.setBigUint64(4, 1000000n, true)
  v.setUint16(16, 1, true)
  v.setUint32(18, 250, true)
  batch.set([2, 0, 200, 40], 22)
  const all = new Uint8Array([...text('OK\nINFO widscan58|esp32c5|1|0.1.0|x|y\n'), ...frame(FRAME_LEVEL_BATCH, batch), ...text('NAME Links\n')])
  for (const cut of [1, 5, 40, 50, all.length - 3]) {
    const p = new Parser()
    const items = [...p.push(all.subarray(0, cut)), ...p.push(all.subarray(cut))]
    assert.deepEqual(
      items.map((i) => (i.kind === 'line' ? i.text : `frame ${i.type}`)),
      ['OK', 'INFO widscan58|esp32c5|1|0.1.0|x|y', 'frame 7', 'NAME Links'],
    )
    const f = items[2]
    assert.ok(f.kind === 'frame')
    const b = parseLevelBatch(f.payload)
    assert.deepEqual(b?.entries, [{ t_us: 1000250, id: 2, flags: 0, rssi: 200, snr: 40 }])
  }
})

test('a bad CRC is skipped', () => {
  const f = frame(3, new Uint8Array([1, 2, 3]))
  f[7] ^= 0xff
  const p = new Parser()
  assert.deepEqual(p.push(new Uint8Array([...f, ...text('OK\n')])).map((i) => i.kind), ['line'])
  assert.equal(p.crcErrors, 1)
})

test('dBFS', () => {
  assert.equal(dbfs(255), 0)
  assert.equal(dbfs(0), -63.75)
})
