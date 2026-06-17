# dotLottie v2 + State Machines — Implementation Reference for OpenLottie Studio

Last updated: 2026-06-11.

## How this document was verified (read this first)

The usual web sources (`https://dotlottie.io/spec/2.0/`, the `dotlottie-web` wiki, the
`dotlottie/dotlottie-js` repo) were **not reachable from this environment** (network tools
denied). Instead, this reference was verified against the **primary artifacts installed in
this repository**, which are ultimately what must accept our files:

- `node_modules/@lottiefiles/dotlottie-web/package.json` — package `@lottiefiles/dotlottie-web`,
  version **0.74.0** (also pinned in our `package.json` as `^0.74.0`).
- `node_modules/@lottiefiles/dotlottie-web/dist/index.d.ts` — full public TypeScript API,
  including the `Manifest` type and every `stateMachine*` method.
- `node_modules/@lottiefiles/dotlottie-web/dist/index.js` — JS glue; shows DOM listener
  auto-attachment, coordinate mapping, and the default WASM CDN URL.
- `node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm` — the actual engine
  (dotlottie-rs compiled to WASM). Its serde deserializer embeds every accepted JSON field
  name as a byte string. Each schema field below was probed against this binary
  (match / no-match), so the field names are verified against the exact engine this app runs.

Confidence legend used throughout:

| Tag | Meaning |
|---|---|
| **[V-wasm]** | Byte string present in `dotlottie-player.wasm` 0.74.0 (and, where noted, a competing spelling is verified ABSENT). |
| **[V-dts]** | Declared verbatim in `dist/index.d.ts` 0.74.0. |
| **[V-js]** | Behavior read directly from `dist/index.js` 0.74.0. |
| **[R]** | Recalled from the dotLottie 2.0 spec / dotlottie-rs / dotlottie-js sources (training knowledge). Not verifiable offline — re-check against https://dotlottie.io/spec/2.0/ before relying on it for interop with other tools. |

Anything tagged [R] is safe to *try* against the local runtime (cheap to smoke-test with
`stateMachineLoadData`, see §5), even if the spec text could not be re-fetched.

---

## 1) v2 `.lottie` ZIP layout

A `.lottie` file is a plain ZIP archive (deflate or store; `fflate.zipSync` output is accepted —
our existing v1 exporter in `src/io/dotlottie.ts` already round-trips through this engine).

```
manifest.json          required, at archive root                         [R, structure verified via Manifest type V-dts]
a/{animationId}.json   Lottie animation JSON, one file per animation     [R]
i/{fileName}           image assets referenced by animations             [V-dts: "Reference to image in dotLottie package (i/ folder)" — ThemeImageValue doc]
t/{themeId}.json       themes                                            [R]
s/{stateMachineId}.json  state machines                                  [R]
u/{fileName}           audio assets                                      [R — least certain; audio may not be in the final 2.0 spec]
```

Supporting evidence for the single-letter folders beyond [R]:

- The engine binary contains the v1 path prefix `animations/` (legacy v1 support) but does
  **not** contain `stateMachines/` or `themes/` [V-wasm], i.e. v2 state machines/themes are
  not read from long-name folders. (`a/`, `s/`, `t/` are too short to probe meaningfully in a
  binary.)
- `i/` is confirmed by the runtime's own JSDoc [V-dts].

File extension is `.lottie`; the archive is opened by the engine via
`load_dotlottie_data(bytes)` — no MIME requirements.

## 2) `manifest.json` (v2) example

The runtime's exact parsed shape, verbatim from `dist/index.d.ts` ( `Manifest` ) [V-dts]:

```ts
interface Manifest {
  animations: Array<{
    background?: string;     // background color for this animation
    id: string;              // unique identifier; animation file is a/{id}.json
    initialTheme?: string;   // default theme to apply when this animation loads
    themes?: string[];       // theme IDs compatible with this animation
  }>;
  generator?: string;        // tool that created the file
  stateMachines?: Array<{ id: string }>;  // state machine file is s/{id}.json
  themes?: Array<{ id: string }>;         // theme file is t/{id}.json
  version?: string;          // dotLottie specification version
}
```

Notes:

- `animations` (with at least one entry carrying `id`) is the only required field in the
  runtime type [V-dts]. The spec marks `version` and `generator` as expected metadata [R].
- The v2 `version` field value is the string `"2"` [R — spec/dotlottie-js convention; the
  runtime type only says `string` and the engine is lenient]. Our current v1 exporter writes
  `"1.0"`; do not reuse that for v2 archives.
- `stateMachines` is a flat list of `{ id }` objects [V-dts]. The wasm engine parses a
  manifest key spelled exactly `stateMachines` [V-wasm].

Example:

```json
{
  "version": "2",
  "generator": "OpenLottie Studio",
  "animations": [{ "id": "hero" }],
  "stateMachines": [{ "id": "hover_click" }]
}
```

ZIP entries for this example: `manifest.json`, `a/hero.json`, `s/hover_click.json`.

## 3) State machine document — TypeScript interfaces (field names verbatim)

Every field/tag name below marked [V-wasm] exists as a string in the engine binary; where a
competing spelling was probed and found absent, that is noted. Optionality markers (`?`) are
[R] unless stated — the engine does not expose which fields are `Option<T>`.

```ts
/** Top-level state machine document (contents of s/{id}.json). */
export interface DotLottieStateMachine {
  initial: string;                  // name of the initial state
                                    // [V-wasm: "initial" present standalone; "initialState" ABSENT; "descriptor" ABSENT]
  states: DotLottieSMState[];       // [V-wasm: "states"]
  inputs?: DotLottieSMInput[];      // [V-wasm-adjacent: "triggers" (old name) ABSENT; input kinds confirmed via runtime API V-dts]
  interactions?: DotLottieSMInteraction[]; // [V-wasm: "interactions" present; "listeners" (old name) ABSENT]
}

export type DotLottieSMState = DotLottieSMPlaybackState | DotLottieSMGlobalState;
// Only these two state type tags exist in the engine:
// [V-wasm: "PlaybackState", "GlobalState"; "SyncState" ABSENT]

export interface DotLottieSMPlaybackState {
  type: 'PlaybackState';            // [V-wasm]
  name: string;
  animation?: string;               // animation id from the manifest; ""/omitted = current animation
                                    // [V-wasm-adjacent: "animationId" ABSENT, so the key is NOT animationId; "animation" itself too generic to probe — name is [R]]
  loop?: boolean;                   // [R — too generic to probe]
  autoplay?: boolean;               // [V-wasm: "autoplay"]
  mode?: 'Forward' | 'Reverse' | 'Bounce' | 'ReverseBounce'; // [V-wasm: "ReverseBounce"; family matches player Mode enum V-dts]
  speed?: number;                   // [R — too generic to probe]
  segment?: string;                 // NAMED LOTTIE MARKER, not [start,end] — see §3.1
  backgroundColor?: number;         // [V-wasm: "backgroundColor"] value format (e.g. 0xAARRGGBB int) is [R/uncertain]
  entryActions?: DotLottieSMAction[]; // [V-wasm: "entryActions"]
  exitActions?: DotLottieSMAction[];  // [V-wasm: "exitActions"]
  transitions: DotLottieSMTransition[]; // TRANSITIONS LIVE PER-STATE, not top-level. [V-wasm: "transitions"]
}
// NOTE: "useFrameInterpolation" is ABSENT from the engine binary — a PlaybackState does NOT
// accept that field in 0.74.0, even though some older docs show it.

export interface DotLottieSMGlobalState {
  type: 'GlobalState';              // its transitions are evaluated regardless of current state [R]
  name: string;
  entryActions?: DotLottieSMAction[];
  exitActions?: DotLottieSMAction[];
  transitions: DotLottieSMTransition[];
}

export interface DotLottieSMTransition {
  type: 'Transition' | 'Tweened';   // [V-wasm: "Transition", "Tweened"]
  toState: string;                  // target state NAME. [V-wasm: "toState"]
  guards?: DotLottieSMGuard[];      // [V-wasm: "guards"]
  // Only for type === 'Tweened' (cross-fade/interpolated transition):
  duration?: number;                // seconds [R]
  easing?: number[];                // cubic-bezier [x1,y1,x2,y2] [V-wasm: "easing"; array format is R]
}

export interface DotLottieSMGuard {
  type: 'Numeric' | 'String' | 'Boolean' | 'Event'; // input kind guarded on [R for tag values — too generic to probe; kinds match runtime input API V-dts]
  inputName: string;                // [V-wasm: "inputName"]
  conditionType?:                   // [V-wasm: "conditionType"]
    | 'Equal' | 'NotEqual'          // [V-wasm: "Equal", "NotEqual"]
    | 'GreaterThan' | 'GreaterThanOrEqual'  // [V-wasm]
    | 'LessThan' | 'LessThanOrEqual';       // [V-wasm]
  compareTo?: number | string | boolean;    // [V-wasm: "compareTo"]
  // 'Event' guards have no conditionType/compareTo: they pass when the named Event input fires [R]
}

export type DotLottieSMInput =
  | { type: 'Numeric'; name: string; value: number }
  | { type: 'Boolean'; name: string; value: boolean }
  | { type: 'String';  name: string; value: string }
  | { type: 'Event';   name: string };
// The four input kinds are confirmed by the runtime API (stateMachineSetNumericInput /
// SetBooleanInput / SetStringInput / FireEvent and the
// stateMachine{Numeric,Boolean,String}InputValueChange + stateMachineInputFired events) [V-dts].
// The exact JSON keys (type/name/value) are [R].

export type DotLottieSMInteractionType =
  | 'Click'          // [V-wasm; also returned by stateMachineGetListeners() and matched literally by the JS glue V-js]
  | 'PointerDown'    // [V-wasm; "OnPointerDown" ABSENT — no On prefix on pointer types]
  | 'PointerUp'      // [V-wasm]
  | 'PointerEnter'   // [V-wasm]
  | 'PointerExit'    // [V-wasm; "PointerLeave" ABSENT — DOM pointerleave is mapped to PointerExit by the glue V-js]
  | 'PointerMove'    // [V-wasm]
  | 'OnComplete'     // [V-wasm] fires when the current playback completes
  | 'OnLoopComplete';// [V-wasm]

export interface DotLottieSMInteraction {
  type: DotLottieSMInteractionType;
  layerName?: string;               // optional hit-test restriction to a named layer [V-wasm: "layerName"]
  actions: DotLottieSMAction[];     // key name "actions" is [R] — unprobeable ("interactions"/"entryActions" contain it as a substring)
}

export type DotLottieSMAction =
  | { type: 'SetBoolean';     inputName: string; value: boolean }  // [V-wasm: "SetBoolean", "inputName"]
  | { type: 'SetNumeric';     inputName: string; value: number }   // [V-wasm]
  | { type: 'SetString';      inputName: string; value: string }   // [V-wasm]
  | { type: 'Increment';      inputName: string; value?: number }  // [V-wasm: "Increment"]
  | { type: 'Decrement';      inputName: string; value?: number }  // [V-wasm: "Decrement"]
  | { type: 'Toggle';         inputName: string }                  // [V-wasm: "Toggle"]
  | { type: 'Fire';           inputName: string }                  // fire an Event input. Tag spelling: see §6 conflicts
  | { type: 'Reset';          inputName: string }                  // reset input to default [V-wasm: "Reset"]
  | { type: 'SetTheme';       value: string }                      // [V-wasm: "SetTheme"; payload key "themeId" is ABSENT from the engine, so "value" [R] is most likely]
  | { type: 'SetFrame';       value: number }                      // [V-wasm: "SetFrame"; payload key [R]]
  | { type: 'SetProgress';    value: number }                      // 0-100 [V-wasm: "SetProgress"; payload key/range [R]]
  | { type: 'OpenUrl';        url: string; target?: string }       // [V-wasm: "OpenUrl"; payload keys [R]] — gated by StateMachineConfig.openUrlPolicy [V-dts]
  | { type: 'FireCustomEvent'; value: string };                    // surfaces as 'stateMachineCustomEvent' runtime event [V-wasm: "FireCustomEvent"; V-dts event]
// "SetExpression" and "SetSlot" are ABSENT from the engine binary — do not emit them.
```

### 3.1 How a PlaybackState references a frame range

- `segment` on a `PlaybackState` is a **string naming a Lottie marker** defined in the
  animation JSON (`markers: [{ "cm": "name", "tm": start, "dr": duration }]`). It is **not**
  an explicit `[startFrame, endFrame]` pair and **not** an animationId. [R — spec recall,
  strongly corroborated locally: the engine has first-class marker machinery
  (`set_marker(name)`, `marker_names()`, `current_marker()` [V-dts on the wasm wrapper]) and
  the spelling `segment` is shared with player exports so it cannot be probed independently.]
- Don't confuse this with the *player-level* `Config.segment?: [number, number]`
  (explicit frame pair) and `Config.marker?: string` — those exist on the dotlottie-web
  `Config`, not in the state machine document [V-dts].
- Switching animations is done per-state via the `animation` field (id from the manifest);
  empty string / omitted means "keep current animation" [R].
- If the animation has no markers, omit `segment` — the state plays the full frame range.

## 4) Complete example state machine

Two playback states; click (via an Event input fired by a Click interaction) toggles
idle → active; hover is tracked with a Boolean input so active returns to idle when the
pointer leaves. Every field name used here is engine-verified per §3 (payload-key caveats
noted there). Markers `idle_loop` / `active_loop` must exist in the animation, or drop the
`segment` lines.

```json
{
  "initial": "idle",
  "states": [
    {
      "type": "PlaybackState",
      "name": "idle",
      "animation": "",
      "segment": "idle_loop",
      "loop": true,
      "autoplay": true,
      "speed": 1,
      "mode": "Forward",
      "transitions": [
        {
          "type": "Transition",
          "toState": "active",
          "guards": [
            { "type": "Event", "inputName": "clicked" }
          ]
        }
      ]
    },
    {
      "type": "PlaybackState",
      "name": "active",
      "animation": "",
      "segment": "active_loop",
      "loop": true,
      "autoplay": true,
      "speed": 1,
      "mode": "Forward",
      "transitions": [
        {
          "type": "Transition",
          "toState": "idle",
          "guards": [
            { "type": "Boolean", "inputName": "hovered", "conditionType": "Equal", "compareTo": false }
          ]
        }
      ]
    }
  ],
  "inputs": [
    { "type": "Event",   "name": "clicked" },
    { "type": "Boolean", "name": "hovered", "value": false }
  ],
  "interactions": [
    {
      "type": "Click",
      "actions": [ { "type": "Fire", "inputName": "clicked" } ]
    },
    {
      "type": "PointerEnter",
      "actions": [ { "type": "SetBoolean", "inputName": "hovered", "value": true } ]
    },
    {
      "type": "PointerExit",
      "actions": [ { "type": "SetBoolean", "inputName": "hovered", "value": false } ]
    }
  ]
}
```

Smoke-test it in seconds without packaging a .lottie (see §5 for setup):

```ts
player.stateMachineLoadData(JSON.stringify(stateMachine)); // returns boolean
player.stateMachineStart();
console.log(player.stateMachineGetStatus(), player.stateMachineGetCurrentState());
```

Note: a JSON example could not be copied from the dotlottie-web wiki (unreachable here);
the example above was authored against the engine-verified schema instead and should be
validated once with `stateMachineLoadData` (returns `false` + `stateMachineError` event on
schema rejection).

## 5) dotlottie-web usage (all [V-dts] / [V-js], version 0.74.0)

```bash
npm i @lottiefiles/dotlottie-web@^0.74.0   # installed here: 0.74.0
```

```ts
import { DotLottie } from '@lottiefiles/dotlottie-web';
// Vite: bundle the WASM instead of pulling it from the CDN (see CSP note below)
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url';

DotLottie.setWasmUrl(wasmUrl); // static; call before constructing any player

const player = new DotLottie({
  canvas: document.querySelector('canvas')!,
  src: '/hero.lottie',           // or data: string | ArrayBuffer | object
  stateMachineId: 'hover_click', // auto: stateMachineLoad(id) + stateMachineStart() after load
  // stateMachineConfig: { openUrlPolicy: { requireUserInteraction: true, whitelist: ['*'] } },
});

player.addEventListener('stateMachineStart', () => {});
player.addEventListener('stateMachineTransition', (e) => {
  console.log(e.fromState, '->', e.toState);
});
player.addEventListener('stateMachineStateEntered', (e) => console.log(e.state));
player.addEventListener('stateMachineCustomEvent', (e) => console.log(e.eventName));
player.addEventListener('stateMachineError', (e) => console.error(e.error));

// Drive inputs from the host app:
player.stateMachineSetBooleanInput('hovered', true);
player.stateMachineSetNumericInput('progress', 42);
player.stateMachineSetStringInput('label', 'hi');
player.stateMachineFireEvent('clicked');
```

Key facts (verified):

- **Constructor options**: `stateMachineId?: string` and
  `stateMachineConfig?: StateMachineConfig` ( `{ openUrlPolicy?: { requireUserInteraction?,
  whitelist? } }` ) on `Config` [V-dts]. When `stateMachineId` is set, the player calls
  `stateMachineLoad(id)` then `stateMachineStart()` itself right after the animation loads
  [V-js].
- **Loading**: `stateMachineLoad(stateMachineId)` (by manifest id from the .lottie) or
  `stateMachineLoadData(jsonString)` (raw document — ideal for the Studio's live preview),
  then `stateMachineStart()` / `stateMachineStop()` [V-dts].
- **The canvas auto-listens.** On `stateMachineStart()`, the player asks the engine which
  interactions the machine uses (`stateMachineGetListeners()`) and attaches exactly the
  needed DOM listeners to the canvas: `Click→'click'`, `PointerUp→'pointerup'`,
  `PointerDown→'pointerdown'`, `PointerMove→'pointermove'`, `PointerEnter→'pointerenter'`,
  `PointerExit→'pointerleave'` [V-js]. This only happens when the canvas is an
  `HTMLCanvasElement` in a window context [V-js].
- **Manual event posting** (needed for `OffscreenCanvas`/`RenderSurface`/`DotLottieWorker`
  custom hosts, or synthetic events): `stateMachinePostClickEvent(x, y)`,
  `stateMachinePostPointerUpEvent`, `stateMachinePostPointerDownEvent`,
  `stateMachinePostPointerMoveEvent`, `stateMachinePostPointerEnterEvent`,
  `stateMachinePostPointerExitEvent` [V-dts]. Coordinates are **canvas pixel coordinates**:
  the built-in listeners compute `x = (clientX - rect.left) * (canvas.width / rect.width)`
  (same for y) [V-js] — match that scaling (it includes devicePixelRatio) when posting manually.
- **Introspection**: `stateMachineGetCurrentState()`, `stateMachineGetStatus()`,
  `stateMachineGetActiveId()`, `stateMachineGet(id)` (raw JSON of a packaged SM),
  `stateMachineGetInputs()` (flat array: name followed by its type), `stateMachineGetListeners()`,
  `stateMachineOverrideState(state, immediate?)` [V-dts]. All `stateMachine*` methods are
  marked `@experimental` in 0.74.0 [V-dts].
- **Events** ( `addEventListener` types) [V-dts]: `stateMachineStart`, `stateMachineStop`,
  `stateMachineTransition` (`fromState`/`toState`), `stateMachineStateEntered` (`state`),
  `stateMachineStateExit` (`state`), `stateMachineCustomEvent` (`eventName`),
  `stateMachineError` (`error`), `stateMachineBooleanInputValueChange`,
  `stateMachineNumericInputValueChange`, `stateMachineStringInputValueChange`
  (`inputName`/`oldValue`/`newValue`), `stateMachineInputFired` (`inputName`),
  `stateMachineInternalMessage` (`message`).
- **WASM + Vite/CSP**: by default the runtime fetches the WASM from
  `https://cdn.jsdelivr.net/npm/{pkg}@{version}/dist/dotlottie-player.wasm` with an
  unpkg.com fallback [V-js]. For offline/strict-CSP builds use the `?url` import +
  `DotLottie.setWasmUrl()` as above — the package explicitly exports
  `./dotlottie-player.wasm` for this [V: package.json `exports`]. A worker-based
  `DotLottieWorker` class (same SM API, Promise-returning, `workerId` option) also exists
  [V-dts]. CSP must additionally allow WebAssembly compilation
  (`script-src 'wasm-unsafe-eval'`) [R — general platform knowledge].

## 6) Authoring the .lottie archive

### Option A (recommended here): fflate — zero new deps, fully local

The project already builds v1 archives with `fflate` (`src/io/dotlottie.ts`). v2 is the same
ZIP with the new manifest + folder names:

```ts
import { zipSync, strToU8 } from 'fflate';

export function exportDotLottieV2(
  doc: LottieDoc,
  stateMachine: DotLottieStateMachine | undefined,
  animId = 'hero',
  smId = 'hover_click',
): Blob {
  const manifest = {
    version: '2',
    generator: 'OpenLottie Studio',
    animations: [{ id: animId }],
    ...(stateMachine ? { stateMachines: [{ id: smId }] } : {}),
  };
  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    [`a/${animId}.json`]: strToU8(JSON.stringify(doc)),
  };
  if (stateMachine) entries[`s/${smId}.json`] = strToU8(JSON.stringify(stateMachine));
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}
```

Folder names `a/` and `s/` carry the [R]-grade caveat from §1 — verify once by loading the
produced blob with `new DotLottie({ data: await blob.arrayBuffer(), stateMachineId: smId, ... })`
and checking `manifest`/`stateMachineGetActiveId()`.

### Option B: `@dotlottie/dotlottie-js` — **[R] entirely unverified locally**

Not installed in this repo and npm was unreachable, so treat all of this as
to-be-confirmed (`npm view @dotlottie/dotlottie-js version` first):

- npm package name: `@dotlottie/dotlottie-js` (repo `github.com/dotlottie/dotlottie-js`).
- v2 archives are written by the default `DotLottie` class since v1.0.0 (legacy writer is
  exported as `DotLottieV1`); version current in 2025 was 1.x.
- Browser-compatible (built on fflate; not Node-only).
- API sketch (recalled): `new DotLottie().addAnimation({ id, data }).addStateMachine({ id, data })`,
  then `await dl.build()`, `await dl.toBlob()` / `toArrayBuffer()` / `download(name)`;
  reading via `fromArrayBuffer(buf)`. State machine TS types/zod schemas live under
  `src/v2/` in the repo and should match §3.

Given Option A works with already-installed deps and the local engine is the ground truth,
prefer Option A for the Studio.

## 7) Conflicts / uncertainty

Sources disagreed or could not be cross-checked on the following — flagged so nobody
hard-codes a wrong assumption:

1. **Web sources unreachable.** dotlottie.io/spec/2.0, the dotlottie-web wiki, GitHub and npm
   could not be fetched (network tools denied in this session). Everything tagged [R] above
   comes from training knowledge of those sources and should be re-checked when network
   access is available. Everything tagged [V-*] is verified against the installed
   `@lottiefiles/dotlottie-web@0.74.0` artifacts and can be trusted for THIS project.
2. **`Fire` vs `FireEvent` action tag.** The engine binary contains both byte sequences, but
   Rust string pooling makes substring evidence ambiguous (`FireEvent` may be `"Fire"+"Event…"`
   pool adjacency; `Fired` from the `InputFired` event also matches). dotlottie-rs sources
   (recall) use `"Fire"`. If `{"type":"Fire"}` is rejected at runtime, try `"FireEvent"`.
3. **Older/newer key names exist in the wild.** Pre-release state machine docs used
   `descriptor`, `triggers` (inputs), `listeners` (interactions), and `On*` pointer event
   names. All four spellings are **verified ABSENT** from this engine — files using them will
   not load. Use `initial` / `inputs` / `interactions` / `Pointer*` as in §3.
4. **`useFrameInterpolation` on PlaybackState** appears in some older examples but is absent
   from this engine binary; do not emit it.
5. **Action payload key names** other than `inputName`/`value`-style: `SetTheme`'s payload is
   NOT `themeId` (verified absent); `value` is the best [R] candidate. `OpenUrl`'s `url`/`target`
   and `SetFrame`/`SetProgress` payload keys are [R] (too generic to probe).
6. **`segment` = marker name** is [R] + strong indirect local evidence (§3.1). If a file with
   a marker-name `segment` doesn't clamp playback, test the alternative `[start,end]` form —
   but the marker-name form is what the 2.0 spec documents.
7. **`backgroundColor` value encoding** in a PlaybackState (likely an integer 0xAARRGGBB or
   0xRRGGBBAA) is unverified; omit it unless needed and test the encoding once.
8. **`Tweened` transition** is supported by the engine ([V-wasm], plus `is_tweening()` on the
   player), but its `duration`/`easing` payload format is [R].
9. **manifest `version: "2"`** exact value is [R]; the runtime treats `version` as an opaque
   optional string, so this matters mainly for interop with other dotLottie tooling.
10. **dotlottie-js section (§6 B)** is wholly unverified locally — package not installed,
    registry unreachable.

## Source files inspected

- `C:\Users\pc\Desktop\anneni\node_modules\@lottiefiles\dotlottie-web\package.json`
- `C:\Users\pc\Desktop\anneni\node_modules\@lottiefiles\dotlottie-web\dist\index.d.ts`
- `C:\Users\pc\Desktop\anneni\node_modules\@lottiefiles\dotlottie-web\dist\index.js`
- `C:\Users\pc\Desktop\anneni\node_modules\@lottiefiles\dotlottie-web\dist\dotlottie-player.wasm` (string probing)
- `C:\Users\pc\Desktop\anneni\src\io\dotlottie.ts` (existing v1 exporter)
- Unreachable (cited for follow-up): https://dotlottie.io/spec/2.0/ ·
  https://github.com/LottieFiles/dotlottie-web/wiki/State-Machines ·
  https://github.com/dotlottie/dotlottie-js
