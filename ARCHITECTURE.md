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
│  4. Priority-Ordered Degradation Cascade               │
│     [Natural Sizing] ──► [Drop P3] ──► [Drop P2] ──►   │
│     [Shrink P1 to Hard Floors]                         │
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
│            `render-dom.ts` (Zero-Layout)               │
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

- **`vertical`** ($\text{Ratio} < 0.8$): Stacks elements top-to-bottom in a single vertical column. Optimizes reading flow on tall devices (e.g., smartphone portrait).
- **`horizontal-band`** ($\text{Ratio} > 2.2$): Divides the horizontal canvas into three distinct functional zones: Left (Hero/Branding), Center (Flexible text block), and Right (Action CTA). Optimizes wide strips (e.g., broadcast lower-thirds, banner ribbons).
- **`grid`** ($0.8 \le \text{Ratio} \le 2.2$): Constructs a structured 2D split-pane arrangement (Hero visual on the left pane, structured content column on the right pane). Optimizes square kiosks, tablets, and desktop displays.

### Step 2: Declarative Natural Sizing (`ROLE_NATURAL_SIZING`)

Element dimensions are determined by semantic role rather than surface name:

| Role | Natural Proportions | Minimum Floor | Typographic Scale |
| :--- | :--- | :--- | :--- |
| `hero` | 45% height share / 48% width share (16:9) | 80 × 80px | — |
| `primary` | Flexible width | 80 × 38px | 26px base ($\times 1.5$ on `far` view) |
| `secondary` | Flexible width | 60 × 28px | 18px base |
| `action` | Flexible width (130–180px) | 120 × 50px | 16px base ($\ge \text{minTapTarget}$ on touch) |
| `branding` | 12% width share / compact | 70 × 38px | 16px base |

### Step 3: Hard Constraint Floors (`hardConstraintFloor`)

Shrinking and compacting may **never** cross physical usability floors:
- On `touchOnly: true` devices: Buttons and interactive elements must satisfy $\text{width} \ge \text{minTapTarget}$ and $\text{height} \ge \text{minTapTarget}$ (default 44px).
- On `viewingDistance: "far"` surfaces: Typography must satisfy $\text{fontSize} \ge \text{minTextSize}$ (default 24px).
- Essential `priority: 1` elements are never dropped. If a priority 1 element cannot fit its hard floor within the usable canvas, the engine throws a `LayoutError`.

### Step 4: Deterministic Degradation Cascade

When available space is insufficient, the resolver evaluates a progressive relaxation ladder in priority order:

1. **Attempt 1 (Full Natural)**: All elements rendered with standard padding (16px) and gaps (12px).
2. **Attempt 2 (Drop Priority 3)**: If space overflows, the lowest-priority element (e.g. `branding`, Priority 3) is dropped (`visible: false`, `degraded: "dropped"`). Remaining elements maintain natural sizes.
3. **Attempt 3 (Drop Priority 2)**: If space remains insufficient, secondary elements (e.g. `price` or `hero`, Priority 2) are dropped.
4. **Attempt 4 (Shrink Priority 1)**: Essential Priority 1 elements (`headline`, `cta`) are shrunk toward their hard constraint floors with compact padding (4px) and gaps (4px).
5. **Fail-Safe**: If Priority 1 elements cannot fit even at their hard constraint floors, `resolveLayout` throws `LayoutError`.

### Step 5: Structural Invariant Enforcement (`assertNoOverlapOrClip`)

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

## 5. Zero-Layout DOM Renderer (`render-dom.ts`)

The renderer implements a pure projection of computed coordinates to DOM styles:

- **Zero Layout Logic**: Element coordinates (`x`, `y`), dimensions (`width`, `height`), and `fontSize` are assigned directly to inline CSS style properties.
- **No CSS Breakpoints**: No media queries or flex/grid layout calculations exist within the renderer.
- **DOM Tree Optimization**: Elements marked `visible: false` are omitted from the DOM tree rather than masked with `display: none`.
- **Styling Chrome**: Tailwind CSS classes are applied strictly for visual chrome (color palettes, border radii, shadows, typography weights).

---

## 6. Extensibility Questions

### Could a new surface be added without touching the resolver?

**Yes, unconditionally.**
The resolver accepts arbitrary `SurfaceProfile` objects. Any new surface with custom dimensions, arbitrary aspect ratios, unique safe area insets, touch constraints, or viewing distances resolves dynamically through the continuous axis derivation and degradation ladder. This is verified by automated generalization tests on unseen surfaces (e.g., 2400 × 300 ribbons, 600 × 1800 elevator pillars, 300 × 300 smartwatch displays).

### Could a new renderer be added without touching the resolver?

**Yes, unconditionally.**
The resolver outputs a purely declarative, immutable `ResolvedLayout` (array of `ResolvedElement` objects with absolute numeric bounds). Any new renderer (e.g. HTML5 Canvas 2D, WebGL, SVG, PDF, or React Native) simply consumes this coordinate stream with zero changes to `resolver.ts`.

---

## 7. Decisions Log

| Decision | Rationale |
| :--- | :--- |
| **Mapped Conditional Types for Surface Profiles** | Enforces `minTapTarget` on touch surfaces and `minTextSize` on far-view surfaces at compile-time in TypeScript IDEs without requiring heavy builder patterns or class hierarchies. |
| **Aspect Ratio Thresholds (0.8 and 2.2)** | $0.8$ captures tall portrait phones ($9:16 \approx 0.56$) while routing square ($1:1$) and standard displays to 2D split-grid mode. $2.2$ routes ultra-wide broadcast lower-thirds ($16:3 \approx 5.33$) to horizontal-band mode. |
| **Injected Text Measurer Interface** | Allows the resolver to run headlessly in pure Node environments during automated testing while utilizing canvas-accurate text measurement in production browser sessions. |
| **Progressive Priority-Based Cascade** | Dropping lower-priority elements before severely compressing essential elements preserves visual hierarchy and legibility. |
| **Synchronous Invariant Assertion in Core** | Calling `assertNoOverlapOrClip` at the end of `resolveLayout` makes non-overlap a structural guarantee rather than an optional test check. |
| **Pure DOM Style Mapping in `render-dom.ts`** | Strictly separates layout computation (handled 100% by the resolver) from DOM projection (handled by the renderer). |
