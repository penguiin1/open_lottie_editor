# OpenLottie MCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude (Claude Code or
Claude Desktop) **rig and animate Lottie files directly**. It wraps the
OpenLottie Studio engine (`src/lottie/*`) — the exact same code the GUI editor
uses — so edits Claude makes are byte-for-byte identical to GUI edits, and every
file passes through the mandatory `normalize` gate.

No browser, no API key. The server runs locally over stdio and reads/writes
`.json` Lottie files on disk.

## Setup

```bash
cd mcp
npm install
npm run smoke   # optional: end-to-end self-test (rig + IK + animate + save)
```

## Tools

| Tool | What it does |
| --- | --- |
| `load_lottie` / `save_lottie` / `new_doc` | open / write / create the active document (load runs `normalize`) |
| `doc_info` / `list_layers` / `get_layer` | inspect the document and layers |
| `add_shape_layer` | add a rect / ellipse / star layer |
| `set_transform_keyframe` | keyframe position / scale / rotation / opacity at a frame |
| `set_transform_static` | set a transform channel to a non-animated value |
| `remove_keyframe` / `set_easing` | delete a key / re-ease a channel (linear, easeIn/Out/InOut) |
| `set_property_keyframe` | keyframe any animatable property by object path (fills, trims, …) |
| `set_parent` | **rigging** — create/clear a parent→child bone link (cycle-safe) |
| `ik_reach` | **2-bone IK** — rotate parent + grandparent so a layer reaches a target |
| `validate` | re-normalize and report dangling parents / cycles / missing transforms |

> Rigging note: `ik_reach` needs a 2-bone chain — the target layer must have a
> parent **and** a grandparent (set them with `set_parent` first), at ~100%
> scale. This is the same cutout-rig model (AE/DUIK-style) as the editor.

## Register with Claude

The server entry is `mcp/server.ts`, run via `tsx`. Use the absolute path on
your machine — below assumes `C:\Users\pc\Desktop\anneni`.

### Claude Code

Project-scoped — create `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "openlottie": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\pc\\Desktop\\anneni\\mcp\\server.ts"],
      "cwd": "C:\\Users\\pc\\Desktop\\anneni\\mcp"
    }
  }
}
```

Or one command: `claude mcp add openlottie -- npx -y tsx C:\Users\pc\Desktop\anneni\mcp\server.ts`

### Claude Desktop

Edit `claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows). On Windows, wrap the
command in `cmd /c` so `npx` resolves:

```json
{
  "mcpServers": {
    "openlottie": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "tsx", "C:\\Users\\pc\\Desktop\\anneni\\mcp\\server.ts"],
      "cwd": "C:\\Users\\pc\\Desktop\\anneni\\mcp"
    }
  }
}
```

Restart Claude Desktop, then look for the tools under the 🔌 / tools menu.

## Example prompts

Once connected, talk to Claude normally:

- "Load `C:\assets\character.json`, then list the layers."
- "Parent the Forearm to the UpperArm and the Hand to the Forearm, then make the
  Hand reach (320, 180) at frame 24 with IK."
- "Animate the Logo layer: scale from 0% at frame 0 to 100% at frame 12 with
  easeOut, then save."
- "Validate the rig and tell me about any dangling parents."

## Limitations / next

- **No live preview yet.** `validate` checks structure but doesn't render. A
  thumbnail/preview tool needs a headless renderer (puppeteer + lottie-web or
  rlottie) — a natural next addition.
- Precomp editing is supported via the optional `comp` argument (the precomp
  asset id) on most tools.
