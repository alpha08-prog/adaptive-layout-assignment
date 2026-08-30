# Adaptive Layout Engine — Technical Architecture

This document details the architectural design, algorithmic models, type-system contracts, and invariant guarantees of the Adaptive Layout Engine for Multi-Surface Ads.

---

## 1. System Resolution Pipeline

The engine executes a single-direction, deterministic transformation from declarative specifications to projected visual components:

```
┌────────────────────────────────────────────────────────┐
│                   Input Contracts                      │
│   Ad Spec (`AdSpec`) + Surface Profile (`SurfaceProfile`)│
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│              Constraint Resolver Engine                │
│                                                        │
│  1. Inset Safe Area ──► Usable Canvas Bounds           │
│  2. Aspect Ratio ────► Continuous Axis Derivation      │
│  3. Hard Floor Pre-check (Priority 1 Feasibility)     │
│  4. Priority-Ordered 8-Stage Degradation Cascade       │
│     [Natural] ──► [Shrink P3] ──► [Reposition P3] ──► │
│     [Drop P3] ──► [Shrink P2] ──► [Reposition P2] ──► │
│     [Drop P2] ──► [Shrink P1 to Hard Floors]           │
│  5. Invariant Assertion (`assertNoOverlapOrClip`)      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Output Contract                      │
│              `ResolvedLayout` (Immutable)              │
│       Array of Bounding Boxes (x, y, w, h, fontSize)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Renderer Layer                      │
│   `render-dom.ts` / `render-canvas.ts` (Zero-Layout)   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Type System & Compile-Time Safety

The system uses a combination of compile-time conditional type intersections and runtime defensive validation to guarantee that impossible configurations are rejected at the earliest possible stage.

### Conditional Compile-Time Enforcement (`surfaces.ts`)

Surfaces with specialized contextual constraints require specific parameters. Rather than relying on documentation alone, `defineSurface` uses TypeScript mapped conditional types:

```typescript
export function defineSurface<const T extends SurfaceProfile>(
  profile: T &
    (T["touchOnly"] extends true ? { minTapTarget: number } : {}) &
    (T["viewingDistance"] extends "far" ? { minTextSize: number } : {})
): T;
```

**How it works:**
- If a caller specifies `touchOnly: true`, the return intersection demands a valid `minTapTarget: number`. Omitting it results in an immediate TypeScript compiler diagnostic.
- If a caller specifies `viewingDistance: "far"`, the return intersection demands a valid `minTextSize: number`.
- The `<const T>` generic parameter preserves literal types, preventing accidental type widening.

### Defensive Runtime Validation (`spec.ts` & `surfaces.ts`)

To protect against dynamic runtime input errors (e.g. data loaded from APIs or user form inputs):
- **`defineAd(spec)`**: Verifies `elements` is non-empty, checks that every element ID is unique across the spec, and validates roles, types, and priorities.
- **`defineSurface(profile)`**: Verifies positive finite dimensions ($W > 0, H > 0$), checks that safe area insets do not exceed or equal surface dimensions, and enforces positive numerical constraints on `minTapTarget` and `minTextSize`.

---

## 3. Constraint Resolution Engine (`resolver.ts`)

The resolver core is implemented in pure TypeScript with **zero DOM globals, zero React dependencies, and zero per-surface identity branches (`if (surface.name === ...)` is strictly forbidden)**. All behavior is derived from continuous mathematical attributes.

### Step 1: Continuous Axis Derivation (`deriveAxis`)

The layout topology is derived purely from the physical aspect ratio ($W / H$):

$$\text{Aspect Ratio} = \frac{\text{width}}{\text{height}}$$

- **`vertical`** ($\text{Aspect Ratio} < 0.8$): Stacks elements top-to-bottom in a single vertical column. Buttons and branding elements are centered horizontally when width is less than content width. Optimizes reading flow on tall devices (e.g., smartphone portrait).
- **`horizontal-band`** ($\text{Aspect Ratio} > 2.2$): Divides the horizontal canvas into three distinct functional zones: Left (Hero visuals & Branding), Center (Flexible text block with measured font heights), and Right (Action CTA buttons). Optimizes wide strips (e.g., broadcast lower-thirds, banner ribbons).
- **`grid`** ($0.8 \le \text{Aspect Ratio} \le 2.2$): Constructs a structured 2D split-pane arrangement (Hero visuals on the left pane, structured content column on the right pane). If no visual elements are present, arranges non-visual items across two balanced side-by-side columns. Optimizes square kiosks, tablets, and desktop displays.

### Step 2: Generic Multi-Element Role Categorization

Instead of singleton lookups (`find(e => e.role === "hero")`), the resolver groups elements into semantic role categories:
- **Visuals / Heroes**: `activeElements.filter(e => e.role === "hero" || (e.type === "image" && e.role !== "branding"))`
- **Branding**: `activeElements.filter(e => e.role === "branding")`
- **Actions / Buttons**: `activeElements.filter(e => e.role === "action" || e.type === "button")`
- **Text Blocks**: `activeElements.filter(e => e.role === "primary" || e.role === "secondary" || e.type === "text")`

This allows any arbitrary combination (e.g., multiple hero images, multiple CTA buttons, zero hero images) to resolve predictably without clipping or collision.

### Step 3: Declarative Natural Sizing (`ROLE_NATURAL_SIZING`)

Element dimensions are determined by semantic role rather than surface name:

| Role | Natural Proportions | Minimum Floor | Typographic Scale |
| :--- | :--- | :--- | :--- |
| `hero` | 45% height share / 48% width share (16:9) | 80 × 80px | — |
| `primary` | Flexible width | 80 × 38px | 26px base ($\times 1.5$ on `far` view) |
| `secondary` | Flexible width | 60 × 28px | 18px base ($\times 1.5$ on `far` view) |
| `action` | Flexible width (130–180px) | 120 × 50px | 16px base ($\ge \text{minTapTarget}$ on touch) |
| `branding` | 12% width share / compact | 70 × 38px | 16px base |

### Step 4: Hard Constraint Floors (`hardConstraintFloor`)

Shrinking and compacting may **never** cross physical usability floors:
- On `touchOnly: true` devices: Buttons and interactive elements must satisfy $\text{width} \ge \text{minTapTarget}$ and $\text{height} \ge \text{minTapTarget}$ (default 44px).
- On `viewingDistance: "far"` surfaces: Typography must satisfy $\text{fontSize} \ge \text{minTextSize}$ (default 24px).
- Essential `priority: 1` elements are never dropped. If a priority 1 element cannot fit its hard floor within the usable canvas, the engine throws a `LayoutError`.

### Step 5: Deterministic 8-Stage Degradation Cascade

When available space is insufficient, the resolver evaluates a progressive relaxation ladder in priority order:

1. **Stage 1 (`natural`)**: Standard padding (16px) and gaps (12px), full natural dimensions.
2. **Stage 2 (`shrink-p3`)**: Priority 3 elements (e.g. `branding`) are scaled down in dimensions and font size (`degraded: "shrunk"`).
3. **Stage 3 (`reposition-p3`)**: Priority 3 elements are moved to compact inline/top-left slots with compact spacing (`degraded: "repositioned"`).
4. **Stage 4 (`drop-p3`)**: Priority 3 elements are dropped completely (`visible: false, degraded: "dropped"`). Remaining P1 and P2 elements maintain natural sizes.
5. **Stage 5 (`shrink-p2`)**: P3 dropped; Priority 2 elements (e.g. `hero`, `price`) are scaled down (`degraded: "shrunk"`).
6. **Stage 6 (`reposition-p2`)**: P3 dropped; Priority 2 elements repositioned into compact layouts with minimal gaps (`degraded: "repositioned"`).
7. **Stage 7 (`drop-p2`)**: P3 and P2 elements dropped (`visible: false, degraded: "dropped"`). Essential P1 elements displayed.
8. **Stage 8 (`shrink-p1`)**: Essential Priority 1 elements (`headline`, `cta`) shrunk toward their hard constraint floors with minimal padding (4px) and gaps (4px).
9. **Fail-Safe**: If Priority 1 elements cannot fit even at their hard constraint floors, `resolveLayout` throws `LayoutError`.

### Step 6: Structural Invariant Enforcement (`assertNoOverlapOrClip`)

At the conclusion of every resolution pass, `assertNoOverlapOrClip` executes synchronously:
- **Boundary Containment**: Ensures every visible element's bounding box $[x, y, x + w, y + h]$ is strictly within $[safeLeft, safeTop, W - safeRight, H - safeBottom]$.
- **Pairwise Collision Detection**: Evaluates all distinct pairs $(A, B)$ of visible elements. If $A$ and $B$ overlap on both axes, a descriptive `LayoutError` is raised.

---

## 4. Decoupled Text Measurement (`measure.ts` / `resolver.ts`)

Typography dimensions are decoupled via the `TextMeasurer` signature:

```typescript
export type TextMeasurer = (text: string, fontSize: number) => { width: number; height: number };
```

- **`mockTextMeasurer`**: Deterministic character-width heuristic for headless Node environments, allowing unit tests to execute with zero browser dependencies.
- **`domTextMeasurer`**: Uses HTML5 Canvas `ctx.measureText` in browser environments for sub-pixel typographic accuracy.

---

## 5. Zero-Layout DOM Renderer (`render-dom.ts`) & Canvas Renderer (`render-canvas.ts`)

The renderer implements a pure projection of computed coordinates:
- **Zero Layout Decisions**: Element coordinates (`x`, `y`), dimensions (`width`, `height`), and `fontSize` are assigned directly to inline CSS style properties or Canvas drawing commands.
- **No CSS Breakpoints**: No media queries or flex/grid layout calculations exist within the renderer.
- **DOM Tree Optimization**: Elements marked `visible: false` are omitted from the DOM tree.

---

## 6. Extensibility Proofs

### Could a new surface be added without touching the resolver?
**Yes, unconditionally.** The resolver accepts arbitrary `SurfaceProfile` objects. Any new surface with custom dimensions, arbitrary aspect ratios, unique safe area insets, touch constraints, or viewing distances resolves dynamically through the continuous axis derivation and degradation ladder.

### Could a new renderer be added without touching the resolver?
**Yes, unconditionally.** The resolver outputs a purely declarative, immutable `ResolvedLayout` (array of `ResolvedElement` objects with absolute numeric bounds). Any new renderer (e.g. HTML5 Canvas 2D, WebGL, SVG, PDF, or React Native) simply consumes this coordinate stream with zero changes to `resolver.ts`.
