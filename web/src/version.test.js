// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareVersions, parseVersion } from './version.js'

test('parse', () => {
  assert.deepEqual(parseVersion('0.1.0'), { nums: [0, 1, 0], pre: null, ahead: 0, dirty: false })
  assert.deepEqual(parseVersion('v0.0.12-5-gabc1234'), { nums: [0, 0, 12], pre: null, ahead: 5, dirty: false })
  assert.deepEqual(parseVersion('0.2.0-rc1-3-gabc1234-dirty'), { nums: [0, 2, 0], pre: 'rc1', ahead: 3, dirty: true })
  assert.equal(parseVersion('abc1234'), null)
  assert.equal(parseVersion('unknown'), null)
  assert.equal(parseVersion(null), null)
})

test('compare', () => {
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0)
  assert.equal(compareVersions('0.1.0', 'v0.1.0'), 0)
  assert.equal(compareVersions('v0.0.12-5-gabc1234', '0.1.0'), -1)
  assert.equal(compareVersions('0.1.0-2-gabc1234', '0.1.0'), 1)
  assert.equal(compareVersions('0.2.0-rc1', '0.2.0'), -1)
  assert.equal(compareVersions('0.2.0-rc2', '0.2.0-rc10'), -1)
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1)
  assert.equal(compareVersions('0.1.0-dirty', '0.1.0'), 1)
  assert.equal(compareVersions('abc1234', '0.1.0'), null)
})
