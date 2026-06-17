// End-to-end smoke test: spawns the MCP server over stdio (exactly as a real
// client would) and drives a full rig + animate + save + reload round trip.
//
//   npm run smoke      (from the mcp/ folder)

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverPath = join(__dirname, 'server.ts')

// A 3-layer arm chain (no parents yet — set_parent will rig it).
// Geometry: UpperArm pivot (100,100) → Forearm pivot (160,100) → Hand pivot (210,100).
function layer(ind: number, nm: string, p: [number, number]) {
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [p[0], p[1], 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0,
    shapes: [],
    ip: 0,
    op: 30,
    st: 0,
    bm: 0,
  }
}

const fixture = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 30,
  w: 512,
  h: 512,
  nm: 'arm',
  ddd: 0,
  assets: [],
  layers: [layer(3, 'Hand', [50, 0]), layer(2, 'Forearm', [60, 0]), layer(1, 'UpperArm', [100, 100])],
}

const dir = mkdtempSync(join(tmpdir(), 'olmcp-'))
const fixturePath = join(dir, 'arm.json')
const outPath = join(dir, 'arm.out.json')
writeFileSync(fixturePath, JSON.stringify(fixture))

// Spawn `node <tsx-cli> server.ts` — the tsx CLI registers its own loader, so
// this works on Node 18/19 (where `--import tsx` is unavailable) and avoids
// npx/.cmd shell quirks on Windows.
const tsxCli = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: [tsxCli, serverPath],
  cwd: __dirname,
})
const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} })

async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const r: any = await client.callTool({ name, arguments: args })
  const text = r?.content?.[0]?.text ?? ''
  if (r?.isError) throw new Error(`${name} -> ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function main() {
  await client.connect(transport)

  // 1. Tools are registered.
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)
  for (const t of ['load_lottie', 'set_parent', 'ik_reach', 'set_transform_keyframe', 'validate', 'save_lottie']) {
    assert.ok(names.includes(t), `tool ${t} should be registered (got: ${names.join(', ')})`)
  }
  console.log(`tools (${names.length}): ${names.join(', ')}`)

  // 2. Load the fixture.
  const loaded = await call('load_lottie', { path: fixturePath })
  assert.equal(loaded.doc.layers, 3)

  // 3. Rig the chain.
  await call('set_parent', { child: 2, parent: 1 })
  await call('set_parent', { child: 3, parent: 2 })

  // Cycle guard must reject.
  let cycled = false
  try {
    await call('set_parent', { child: 1, parent: 3 })
  } catch {
    cycled = true
  }
  assert.ok(cycled, 'set_parent should reject a cycle (1 -> 3 -> 2 -> 1)')

  // 4. Two-bone IK: reach the Hand pivot to (160,160) at frame 15.
  const sol = await call('ik_reach', { ind: 3, frame: 15, targetX: 160, targetY: 160 })
  assert.equal(sol.rootInd, 1)
  assert.equal(sol.midInd, 2)
  assert.ok(Number.isFinite(sol.rootR) && Number.isFinite(sol.midR), 'IK solution must be finite')
  console.log(`IK: rootR=${sol.rootR.toFixed(2)}  midR=${sol.midR.toFixed(2)}`)

  // IK wrote rotation keyframes on root + mid.
  const upper = await call('get_layer', { ind: 1 })
  assert.ok(upper.summary.animated.r, 'UpperArm rotation should now be animated')
  assert.ok(upper.summary.keyframes.r.includes(15), 'UpperArm should have a rotation key at frame 15')

  // 5. Animate the root's position 0 -> 30.
  await call('set_transform_keyframe', { ind: 1, key: 'p', frame: 0, value: [100, 100] })
  await call('set_transform_keyframe', { ind: 1, key: 'p', frame: 30, value: [200, 100] })

  // 6. Validate.
  const v = await call('validate')
  assert.ok(v.ok, `validate should pass, got issues: ${JSON.stringify(v.issues)}`)

  // 7. Save, then reload in a fresh load to confirm persistence.
  await call('save_lottie', { path: outPath })
  const reloaded = await call('load_lottie', { path: outPath })
  const l1 = reloaded.layers.find((l: any) => l.ind === 1)
  assert.ok(l1.keyframes.p.includes(0) && l1.keyframes.p.includes(30), 'position keys must persist')
  assert.ok(l1.keyframes.r.includes(15), 'IK rotation key must persist')
  const l2 = reloaded.layers.find((l: any) => l.ind === 2)
  assert.equal(l2.parent, 1, 'Forearm parent must persist')

  console.log('\nSMOKE PASS ✓')
}

main()
  .then(() => transport.close())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('\nSMOKE FAIL ✗')
    console.error(e)
    try {
      await transport.close()
    } catch {}
    process.exit(1)
  })
