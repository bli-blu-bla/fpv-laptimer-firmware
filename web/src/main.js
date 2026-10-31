// @ts-check
// The firmware page: connect to a board over Web Serial, show what it runs
// (INFO), name it (NAME), flash the firmware deployed with the page, watch
// its levels and talk to it in a console. Plain DOM, no framework: the
// elements are in index.html, this file fills them in.
// GPL-3.0-or-later.

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './style.css'
import { flashFirmware, loadManifest, requestPort, webSerialAvailable } from './flasher.js'
import { BoardLink } from './link.js'
import { FRAME_LEVEL_BATCH, dbfs, parseLevelBatch } from './frames.js'
import { compareVersions } from './version.js'

const ESPRESSIF_VID = 0x303a
const SLOT_COLORS = ['#ff8a3d', '#5ec8e5', '#a6d96a', '#e38ad6', '#f2d45c', '#7b9cff', '#ff6b6b', '#5fd3b5']
/** Seconds of levels in the graph. */
const GRAPH_SECONDS = 10
/** Lines kept in the console. */
const CONSOLE_LINES = 500

/** @param {string} id */
function el(id) {
  const e = document.getElementById(id)
  if (!e) throw new Error(`#${id} fehlt`)
  return e
}
const input = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (el(id))
const button = (/** @type {string} */ id) => /** @type {HTMLButtonElement} */ (el(id))

/**
 * @typedef {{chip: string, proto: string, version: string, date: string, phy: string}} BoardInfo
 */

const state = {
  /** @type {SerialPort | null} */
  port: null,
  /** @type {BoardLink | null} */
  link: null,
  /** @type {BoardInfo | null} */
  info: null,
  /** @type {import('./flasher.js').Manifest | null} */
  manifest: null,
  flashing: false,
  measuring: false,
  /** Channel names as sent with CHANNELS (the frames carry the index). @type {string[]} */
  channels: [],
  /** Per channel index: [time µs, dBFS] of the last GRAPH_SECONDS. @type {[number, number][][]} */
  history: [],
  frames: 0,
}

// ---------------------------------------------------------------- setup

if (!webSerialAvailable()) {
  el('no-serial').hidden = false
  button('connect').disabled = true
}

loadManifest()
  .then((m) => {
    state.manifest = m
    el('offered').textContent = `Neueste: ${m.version}` + (m.date ? ` vom ${germanDate(m.date)}` : '')
    render()
  })
  .catch((/** @type {Error} */ e) => {
    el('offered').textContent = 'keine bereitgestellt'
    el('flash-error').textContent = e.message
  })

button('connect').onclick = () => connect()
button('disconnect').onclick = () => disconnect()
button('flash').onclick = () => flash()
button('level-start').onclick = () => startLevels()
button('level-stop').onclick = () => stopLevels()
button('name-clear').onclick = () => saveName('')
el('name-form').onsubmit = (e) => {
  e.preventDefault()
  saveName(input('name').value.trim())
}
el('cmd-form').onsubmit = (e) => {
  e.preventDefault()
  const line = input('cmd').value.trim()
  if (!line || !state.link) return
  input('cmd').value = ''
  log('→ ' + line, 'out')
  state.link.send(line).catch((/** @type {Error} */ err) => log(err.message, 'err'))
}
button('console-clear').onclick = () => (el('console').textContent = '')

setInterval(() => {
  el('frame-rate').textContent = state.link ? `${state.frames} Frames/s` : ''
  state.frames = 0
}, 1000)

// ---------------------------------------------------------------- connection

/** Asks for a port (from a click) and connects. */
async function connect() {
  let port
  try {
    port = await requestPort()
  } catch {
    return // chooser closed
  }
  await openLink(port)
}

/** @param {SerialPort} port @returns {Promise<boolean>} */
async function openLink(port) {
  const link = new BoardLink(port, {
    line: (text) => log('← ' + text, 'in'),
    frame: (type, payload) => {
      state.frames++
      if (type === FRAME_LEVEL_BATCH) onLevels(payload)
    },
    closed: (why) => {
      if (state.link !== link) return
      state.link = null
      state.measuring = false
      log(why, 'err')
      render()
    },
  })
  try {
    await link.open()
  } catch (e) {
    const msg = /** @type {Error} */ (e).message
    setStatus(
      /busy|in use|open/i.test(msg)
        ? 'Port belegt: Ein anderes Programm (Laptimer-Server, Flash-Script, ein anderer Tab) hat ihn offen.'
        : msg,
      true,
    )
    return false
  }
  state.port = port
  state.link = link
  state.info = null
  render()
  await readInfo()
  return true
}

async function disconnect() {
  const link = state.link
  if (!link) return
  if (state.measuring) await stopLevels()
  state.link = null
  await link.close()
  render()
}

/** INFO and NAME?; a board that is streaming may need a second try. */
async function readInfo() {
  const link = state.link
  if (!link) return
  setStatus('Frage das Board …')
  /** @type {string | null} */
  let reply = null
  for (let i = 0; i < 3 && !reply; i++) reply = await link.query('INFO', 'INFO ', 800).catch(() => null)
  if (state.link !== link) return
  if (!reply) {
    state.info = null
    setStatus('Keine Antwort auf INFO: keine Laptimer-Firmware, oder das Board hängt. Aufspielen hilft.', true)
    render()
    return
  }
  // INFO widscan58|<chip>|<proto>|<version>|<commit date>|<phy>
  const f = reply.slice(5).split('|')
  state.info = { chip: f[1] ?? '?', proto: f[2] ?? '?', version: f[3] ?? '?', date: f[4] ?? '', phy: f[5] ?? '' }
  const name = await link.query('NAME?', 'NAME', 800).catch(() => null)
  if (name != null) input('name').value = name.slice(5)
  setStatus('verbunden')
  render()
}

// ---------------------------------------------------------------- name

/** NAME <text>, or NAME alone to clear it. @param {string} name */
async function saveName(name) {
  const link = state.link
  if (!link) return
  const problem = nameProblem(name)
  if (problem) return nameStatus(problem, true)
  try {
    const reply = await link.query(name ? `NAME ${name}` : 'NAME', 'OK', 1500)
    if (reply == null) return nameStatus('Keine Antwort vom Board.', true)
    input('name').value = name
    nameStatus(name ? `Gespeichert: „${name}“` : 'Name gelöscht')
  } catch (e) {
    const msg = /** @type {Error} */ (e).message
    const old = msg === 'ERR command' || msg === 'ERR rh_mode' // firmware from before NAME
    nameStatus(msg === 'ERR name' ? 'Ungültiger Name.' : old ? 'Diese Firmware kennt NAME noch nicht: erst aufspielen.' : msg, true)
  }
}

/** The firmware's rule: up to 32 bytes UTF-8, no "|", no control characters.
 * @param {string} name @returns {string | null} */
function nameProblem(name) {
  if (new TextEncoder().encode(name).length > 32) return 'Höchstens 32 Byte (Umlaute zählen doppelt).'
  if (name.includes('|')) return 'Kein „|“ im Namen.'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Keine Steuerzeichen im Namen.'
  return null
}

/** @param {string} text @param {boolean} [error] */
function nameStatus(text, error = false) {
  const s = el('name-status')
  s.textContent = text
  s.className = 'small ' + (error ? 'error' : 'ok')
}

// ---------------------------------------------------------------- flash

async function flash() {
  const manifest = state.manifest
  if (!manifest || state.flashing) return
  let port = state.port
  if (!state.link) {
    // Not connected: choose the board now (needs this click).
    try {
      port = await requestPort()
    } catch {
      return
    }
  }
  if (!port) return
  state.flashing = true
  el('flash-error').textContent = ''
  const logEl = el('flash-log')
  logEl.textContent = ''
  logEl.hidden = true
  el('flash-progress').hidden = false
  flashStage('Vorbereiten …', 0)
  render()
  try {
    await disconnect() // the flasher opens the port itself
    await flashFirmware(port, manifest, {
      stage: (t) => flashStage(t),
      progress: (f) => flashStage(null, f),
      log: (line) => (logEl.textContent += line + '\n'),
    })
    flashStage('Warte auf das Board …', 1)
    const ok = await reconnect()
    const v = /** @type {BoardInfo | null} */ (state.info)?.version
    flashStage(ok && v ? `Fertig: Firmware ${v}` : `Geschrieben: ${manifest.version}. Board neu verbinden.`, null)
  } catch (e) {
    let msg = /** @type {Error} */ (e).message
    if (/open|busy|in use/i.test(msg)) msg += ' – Hat ein anderes Programm den Port offen (Laptimer-Server, Flash-Script)?'
    el('flash-error').textContent = msg
    flashStage('Fehlgeschlagen', null)
    logEl.hidden = !logEl.textContent
  } finally {
    state.flashing = false
    render()
  }
}

/** @param {string | null} stage @param {number | null} [fraction] */
function flashStage(stage, fraction) {
  if (stage != null) el('flash-stage').textContent = stage
  if (fraction !== undefined) {
    const bar = /** @type {HTMLElement} */ (el('flash-fill').parentElement)
    bar.hidden = fraction == null
    el('flash-fill').style.width = `${Math.round((fraction ?? 0) * 100)}%`
  }
}

/** After a flash the board restarts and comes back on USB: open it again
 * (a port this page was granted needs no chooser). */
async function reconnect() {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const ports = await navigator.serial.getPorts()
    const candidates = [state.port, ...ports.filter((p) => p.getInfo().usbVendorId === ESPRESSIF_VID)]
    for (const p of candidates) {
      if (!p) continue
      try {
        if (await openLink(p)) {
          if (state.info) return true
          await disconnect()
        }
      } catch {
        /* not back yet */
      }
    }
  }
  return false
}

// ---------------------------------------------------------------- levels

async function startLevels() {
  const link = state.link
  if (!link) return
  const spec = input('channels').value.trim().toUpperCase().split(/\s+/).filter(Boolean)
  if (!spec.length || spec.some((c) => !/^[A-Z0-9]+=\d{4}$/.test(c))) {
    el('level-status').textContent = 'Kanäle als Name=MHz, z. B. R1=5658'
    return
  }
  state.channels = spec.map((c) => c.split('=')[0])
  state.history = state.channels.map(() => [])
  try {
    for (const line of ['PROTOCOL MONITOR', `CHANNELS ${spec.join(' ')}`, 'METRICS RSSI', 'LEVELBATCH 10']) {
      log('→ ' + line, 'out')
      const reply = await link.query(line, 'OK', 1500)
      if (reply == null) throw new Error(`Keine Antwort auf ${line}`)
    }
  } catch (e) {
    el('level-status').textContent = /** @type {Error} */ (e).message
    return
  }
  state.measuring = true
  el('level-status').textContent = 'misst'
  render()
  requestAnimationFrame(drawGraph)
}

async function stopLevels() {
  const link = state.link
  state.measuring = false
  el('level-status').textContent = ''
  render()
  if (!link) return
  log('→ PROTOCOL RH', 'out')
  await link.send('PROTOCOL RH').catch(() => {})
}

/** @param {Uint8Array} payload */
function onLevels(payload) {
  if (!state.measuring) return
  const batch = parseLevelBatch(payload)
  if (!batch) return
  for (const e of batch.entries) {
    const h = state.history[e.id]
    if (!h) continue
    h.push([e.t_us, dbfs(e.rssi)])
  }
  const last = batch.entries.at(-1)?.t_us ?? 0
  for (const h of state.history) {
    const cut = h.findIndex(([t]) => t >= last - GRAPH_SECONDS * 1e6)
    if (cut > 0) h.splice(0, cut)
  }
}

function drawGraph() {
  if (!state.measuring) return
  const canvas = /** @type {HTMLCanvasElement} */ (el('level-graph'))
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const hgt = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(hgt * dpr)
  }
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, hgt)
  const end = Math.max(0, ...state.history.map((h) => h.at(-1)?.[0] ?? 0))
  const lo = -65
  const hi = -5
  const y = (/** @type {number} */ db) => hgt - ((Math.min(hi, Math.max(lo, db)) - lo) / (hi - lo)) * hgt
  // dB grid
  ctx.strokeStyle = '#292b31'
  ctx.fillStyle = '#75798c'
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.lineWidth = 1
  for (let db = -60; db <= -10; db += 10) {
    ctx.beginPath()
    ctx.moveTo(0, y(db) + 0.5)
    ctx.lineTo(w, y(db) + 0.5)
    ctx.stroke()
    ctx.fillText(`${db}`, 4, y(db) - 3)
  }
  state.history.forEach((h, i) => {
    ctx.strokeStyle = SLOT_COLORS[i % SLOT_COLORS.length]
    ctx.lineWidth = 1.5
    ctx.beginPath()
    // One point per pixel column: the highest level in it, so no peak is lost.
    let col = -1
    let best = -Infinity
    const flush = () => {
      if (col >= 0) ctx.lineTo(col, y(best))
    }
    for (const [t, db] of h) {
      const x = Math.round(w - ((end - t) / (GRAPH_SECONDS * 1e6)) * w)
      if (x !== col) {
        flush()
        col = x
        best = db
      } else best = Math.max(best, db)
    }
    flush()
    ctx.stroke()
  })
  renderLevelValues()
  requestAnimationFrame(drawGraph)
}

/** The current level per channel, as text in the slot colours. */
function renderLevelValues() {
  const box = el('levels')
  const now = Math.max(0, ...state.history.map((h) => h.at(-1)?.[0] ?? 0))
  box.replaceChildren(
    ...state.channels.map((name, i) => {
      const recent = state.history[i].filter(([t]) => t >= now - 200e3).map(([, db]) => db)
      const value = recent.length ? Math.max(...recent) : null
      const item = document.createElement('span')
      item.className = 'level'
      item.style.setProperty('--lane', SLOT_COLORS[i % SLOT_COLORS.length])
      const label = document.createElement('b')
      label.textContent = name
      const level = document.createElement('span')
      level.className = 'tnum'
      level.textContent = value == null ? '–' : `${value.toFixed(1)} dBFS`
      item.append(label, level)
      return item
    }),
  )
}

// ---------------------------------------------------------------- view

function render() {
  const connected = state.link != null
  const info = state.info
  button('connect').hidden = connected
  button('disconnect').hidden = !connected
  el('connect-hint').hidden = connected
  el('link-dot').className = 'dot' + (connected ? (info ? ' on' : ' warn') : '')
  if (!connected && !state.flashing) setStatus('nicht verbunden')

  el('info').hidden = !info
  el('name-form').hidden = !info
  if (!info) el('name-status').textContent = ''
  if (info) {
    el('info-version').textContent = info.version
    el('info-chip').textContent = info.chip
    el('info-date').textContent = info.date ? germanDate(info.date) : '–'
    el('info-proto').textContent = info.proto
    el('info-phy').textContent = info.phy || '–'
    const tag = el('info-tag')
    const cmp = state.manifest ? compareVersions(info.version, state.manifest.version) : null
    const [text, cls] =
      cmp == null
        ? state.manifest
          ? ['andere Version', 'tag']
          : ['', '']
        : cmp < 0
          ? ['veraltet', 'tag tag-accent']
          : cmp > 0
            ? ['neuer als bereitgestellt', 'tag']
            : ['aktuell', 'tag tag-ok']
    tag.textContent = text
    tag.className = cls
  }

  const flashBtn = button('flash')
  flashBtn.disabled = !state.manifest || state.flashing || !webSerialAvailable()
  flashBtn.textContent = state.manifest ? `${state.manifest.version} aufspielen` : 'Aufspielen'
  el('flash-hint').textContent = connected
    ? 'Schreibt die Firmware auf das verbundene Board; danach verbindet sich die Seite wieder.'
    : 'Schreibt die Firmware auf ein Board, das du danach wählst.'

  button('level-start').disabled = !connected || !info || state.flashing
  button('level-start').hidden = state.measuring
  button('level-stop').hidden = !state.measuring
  input('channels').disabled = state.measuring
  el('level-graph').hidden = !state.measuring
  if (!state.measuring) el('levels').replaceChildren()

  input('cmd').disabled = !connected
  button('cmd-send').disabled = !connected
}

/** @param {string} text @param {boolean} [error] */
function setStatus(text, error = false) {
  const s = el('link-status')
  s.textContent = text
  s.className = 'end small ' + (error ? 'error' : 'muted')
}

/** @param {string} text @param {'in' | 'out' | 'err'} kind */
function log(text, kind) {
  const box = el('console')
  const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 4
  const line = document.createElement('div')
  line.className = kind
  line.textContent = text
  box.append(line)
  while (box.childElementCount > CONSOLE_LINES) box.firstElementChild?.remove()
  if (atEnd) box.scrollTop = box.scrollHeight
}

/** "2026-10-31T10:12:00+01:00" or "2026-10-31" → "31.10.2026". @param {string} iso */
function germanDate(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

render()
