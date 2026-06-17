// OpenLottie MCP server.
//
// Exposes the headless Lottie editing engine (engine.ts, which wraps
// src/lottie/*) as MCP tools so Claude (Code or Desktop) can rig and animate
// Lottie files directly. Transport is stdio.
//
// IMPORTANT: stdio uses stdout for the protocol — never write to stdout here.
// Diagnostics go to stderr (console.error).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import {
  loadDocFromFile,
  saveDocToFile,
  newDoc,
  docSummary,
  listLayers,
  findLayer,
  layerSummary,
  addShapeLayer,
  setTransformKeyframe,
  setTransformStatic,
  removeTransformKeyframe,
  setTransformEasing,
  setPropertyKeyframe,
  setParent,
  ikReach,
  validate,
} from './engine.ts'
import type { LottieDoc } from '../src/types/lottie'

// --- in-memory editing session --------------------------------------------

let currentDoc: LottieDoc | null = null
let currentPath: string | null = null

function requireDoc(): LottieDoc {
  if (!currentDoc) {
    throw new Error('No document loaded. Call load_lottie or new_doc first.')
  }
  return currentDoc
}

// --- server + tool registration helper -------------------------------------

const server = new McpServer({ name: 'openlottie', version: '0.1.0' })

type Handler = (args: any) => unknown | Promise<unknown>

function reg(name: string, description: string, inputSchema: z.ZodRawShape, handler: Handler) {
  server.registerTool(name, { description, inputSchema }, async (args: any) => {
    try {
      const result = await handler(args ?? {})
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      return { content: [{ type: 'text' as const, text }] }
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `Error: ${e?.message ?? String(e)}` }], isError: true }
    }
  })
}

const KEY = z.enum(['p', 's', 'r', 'o']).describe('transform channel: p=position, s=scale, r=rotation, o=opacity')
const EASING = z
  .enum(['linear', 'easeIn', 'easeOut', 'easeInOut'])
  .describe('keyframe easing preset')
const COMP = z
  .string()
  .optional()
  .describe('optional precomp asset id to edit instead of the root composition')
const VALUE = z
  .array(z.number())
  .describe('value: position [x,y], scale [sx,sy] in %, rotation [deg], opacity [0-100]')

// --- document lifecycle ----------------------------------------------------

reg(
  'load_lottie',
  'Open a Lottie JSON file as the active document (runs the mandatory normalize pass). Returns a summary and the layer list.',
  { path: z.string().describe('absolute path to a .json Lottie file') },
  ({ path }) => {
    currentDoc = loadDocFromFile(path)
    currentPath = path
    return { loaded: path, doc: docSummary(currentDoc), layers: listLayers(currentDoc) }
  },
)

reg(
  'new_doc',
  'Create a new empty Lottie document as the active document.',
  {
    w: z.number().optional().describe('width px (default 512)'),
    h: z.number().optional().describe('height px (default 512)'),
    fr: z.number().optional().describe('frame rate (default 30)'),
    op: z.number().optional().describe('out point / total frames (default 90)'),
    name: z.string().optional(),
  },
  ({ w, h, fr, op, name }) => {
    currentDoc = newDoc(w, h, fr, op, name)
    currentPath = null
    return { doc: docSummary(currentDoc) }
  },
)

reg(
  'save_lottie',
  'Write the active document to disk. Defaults to the path it was loaded from.',
  {
    path: z.string().optional().describe('output path (defaults to the loaded path)'),
    pretty: z.boolean().optional().describe('pretty-print the JSON (default false / minified)'),
  },
  ({ path, pretty }) => {
    const doc = requireDoc()
    const out = path ?? currentPath
    if (!out) throw new Error('No path given and the document was not loaded from a file.')
    saveDocToFile(out, doc, !!pretty)
    currentPath = out
    return { saved: out, doc: docSummary(doc) }
  },
)

// --- inspection ------------------------------------------------------------

reg('doc_info', 'Summarize the active document.', {}, () => docSummary(requireDoc()))

reg(
  'list_layers',
  'List the layers of the active composition with their animation state.',
  { comp: COMP },
  ({ comp }) => listLayers(requireDoc(), comp),
)

reg(
  'get_layer',
  'Get one layer: a summary plus its full transform (ks) and shape count.',
  { ind: z.number().describe('layer index (ind)'), comp: COMP },
  ({ ind, comp }) => {
    const l = findLayer(requireDoc(), ind, comp)
    if (!l) throw new Error(`layer ind=${ind} not found`)
    return { summary: layerSummary(l), ks: l.ks, shapes: Array.isArray(l.shapes) ? l.shapes.length : 0 }
  },
)

// --- layer creation --------------------------------------------------------

reg(
  'add_shape_layer',
  'Add a shape layer (rectangle / ellipse / star) to the active composition. Returns its ind.',
  {
    kind: z.enum(['rect', 'ellipse', 'star']).describe('shape kind'),
    name: z.string().optional(),
    comp: COMP,
  },
  ({ kind, name, comp }) => {
    const ind = addShapeLayer(requireDoc(), kind, name, comp)
    return { added: ind }
  },
)

// --- transform animation ---------------------------------------------------

reg(
  'set_transform_keyframe',
  'Set (insert/overwrite) a keyframe on a transform channel at a frame. Animates the property if it was static.',
  { ind: z.number(), key: KEY, frame: z.number(), value: VALUE, easing: EASING.optional(), comp: COMP },
  ({ ind, key, frame, value, easing, comp }) =>
    setTransformKeyframe(requireDoc(), ind, key, frame, value, easing, comp),
)

reg(
  'set_transform_static',
  'Set a transform channel to a static (non-animated) value, dropping any keyframes.',
  { ind: z.number(), key: KEY, value: VALUE, comp: COMP },
  ({ ind, key, value, comp }) => setTransformStatic(requireDoc(), ind, key, value, comp),
)

reg(
  'remove_keyframe',
  'Remove the keyframe at a frame on a transform channel (collapses to static when one key remains).',
  { ind: z.number(), key: KEY, frame: z.number(), comp: COMP },
  ({ ind, key, frame, comp }) => removeTransformKeyframe(requireDoc(), ind, key, frame, comp),
)

reg(
  'set_easing',
  'Rewrite the easing of every keyframe on a transform channel to a preset.',
  { ind: z.number(), key: KEY, easing: EASING, comp: COMP },
  ({ ind, key, easing, comp }) => setTransformEasing(requireDoc(), ind, key, easing, comp),
)

reg(
  'set_property_keyframe',
  'Keyframe an arbitrary animatable property addressed by object path within a layer (e.g. a fill color ["shapes",1,"c"] or a trim start ["shapes",2,"s"]).',
  {
    ind: z.number(),
    path: z.array(z.union([z.string(), z.number()])).describe('object path from the layer root'),
    frame: z.number(),
    value: z.array(z.number()),
    easing: EASING.optional(),
    comp: COMP,
  },
  ({ ind, path, frame, value, easing, comp }) =>
    setPropertyKeyframe(requireDoc(), ind, path, frame, value, easing, comp),
)

// --- rigging ---------------------------------------------------------------

reg(
  'set_parent',
  'Rig a parent→child bone link (or clear it with parent=null). Rejects self-links and cycles.',
  {
    child: z.number().describe('child layer ind'),
    parent: z.number().nullable().describe('parent layer ind, or null to unparent'),
    comp: COMP,
  },
  ({ child, parent, comp }) => setParent(requireDoc(), child, parent, comp),
)

reg(
  'ik_reach',
  'Two-bone inverse kinematics: rotate a layer\'s parent and grandparent so the layer\'s pivot reaches a composition-space target. Set parents with set_parent first. Writes rotation keyframes when commit is true.',
  {
    ind: z.number().describe('end-effector layer ind (the tip of the 2-bone chain)'),
    frame: z.number(),
    targetX: z.number(),
    targetY: z.number(),
    commit: z.boolean().optional().describe('write the solution as rotation keyframes (default true)'),
    easing: EASING.optional(),
    comp: COMP,
  },
  ({ ind, frame, targetX, targetY, commit, easing, comp }) =>
    ikReach(requireDoc(), ind, frame, targetX, targetY, commit ?? true, easing, comp),
)

// --- validation ------------------------------------------------------------

reg(
  'validate',
  'Re-normalize the active document and report structural problems (missing transforms, dangling parents, parent cycles).',
  {},
  () => validate(requireDoc()),
)

// --- boot ------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[openlottie-mcp] ready on stdio')
}

main().catch((e) => {
  console.error('[openlottie-mcp] fatal:', e)
  process.exit(1)
})
