# Adaptive Layout Engine for Multi-Surface Ads

A pure TypeScript constraint resolution engine that dynamically resolves a single declarative ad specification across fundamentally distinct surfaces (varying aspect ratios, safe areas, touch targets, and viewing distances) — with **zero per-surface hardcoded layout branches**.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation & Running the Demo

```bash
# 1. Clone the repository and enter the directory
cd adaptive-layout-assignment

# 2. Install dependencies
npm install

# 3. Start the interactive multi-surface studio
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### How to Run the Demo & Switch Surfaces

1. **Surface Picker (Left Panel)**:
   - Click any preset card (**Mobile Portrait**, **Mobile Landscape**, **Broadcast Lower-Third**, **Square Kiosk**, **Square Kiosk (Compact)**, **Square Kiosk (Tight)**).
   - The layout engine synchronously re-resolves the single declarative `AdSpec` into a distinct layout tailored to that surface's geometry and constraints.
2. **Interactive Safe Area Toggle**:
   - Toggle **Show Safe Areas** in the top bar to visualize the dashed safe bounding box overlays.
3. **Custom Surface Playground (`⚙️ Custom Surface`)**:
   - Select **Custom Surface** to adjust width, height, safe area insets, touch constraints, and viewing distances live.
   - Click any unseen preset (e.g. *In-Car Panoramic HUD 2560×720*, *Smart Fridge 1080×1920*, *Stadium Jumbotron 3840×1080*, *Micro HUD 280×280*) to test generalization.
4. **Dual Renderer Switcher**:
   - Switch between **DOM Renderer** (HTML5 styled elements) and **Canvas Renderer** (HTML5 Canvas 2D) to verify that the layout output is renderer-agnostic.
5. **Layout Output Inspector (Bottom-Right Panel)**:
   - Inspect computed coordinates $(x, y)$, dimensions $(w, h)$, font size, and degradation status (`NORMAL`, `SHRUNK`, `REPOSITIONED`, `DROPPED`) for every element.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server with HMR |
| `npm run test` | Executes the Vitest unit test suite (43 automated tests) |
| `npm run typecheck` | Runs strict TypeScript type checking (`tsc -b --noEmit`) |
| `npm run build` | Compiles TypeScript and builds production distribution |
| `npm run preview` | Previews the production build locally |

---

## 🧠 Layout Algorithm: Step-by-Step

The engine resolves layout through a single-direction, deterministic mathematical pipeline:

```
Ad Spec + Surface Profile
           │
           ▼
1. Safe Area Inset Calculation  ──► Usable Canvas Bounds (W_avail, H_avail)
           │
           ▼
2. Continuous Axis Derivation   ──► Layout Orientation (vertical | horizontal-band | grid)
           │
           ▼
3. Priority 1 Pre-Check         ──► Verifies essential elements fit usable bounds
           │
           ▼
4. Progressive Cascade Ladder   ──► 8-stage priority-ordered relaxation (Shrink ➔ Reposition ➔ Drop)
           │
           ▼
5. Invariant Assertion          ──► assertNoOverlapOrClip() structural guarantee
           │
           ▼
    ResolvedLayout (Immutable array of bounding boxes: x, y, width, height, fontSize)
           │
           ▼
    Renderer Layer (render-dom.ts / render-canvas.ts)
```

### Step 1: Usable Area Inset Calculation
Subtract safe area insets from the physical dimensions:
$$W_{\text{avail}} = W_{\text{surface}} - \text{safeLeft} - \text{safeRight}$$
$$H_{\text{avail}} = H_{\text{surface}} - \text{safeTop} - \text{safeBottom}$$
If $W_{\text{avail}} \le 0$ or $H_{\text{avail}} \le 0$, a descriptive `LayoutError` is thrown.

### Step 2: Continuous Axis Derivation (`deriveAxis`)
The engine determines layout topology purely from continuous geometry ($W_{\text{surface}} / H_{\text{surface}}$ aspect ratio), **without looking at surface names or IDs**:
- **`vertical`** ($\text{Aspect Ratio} < 0.8$): Stacks elements top-to-bottom in a vertical column, centering interactive buttons and branding.
- **`horizontal-band`** ($\text{Aspect Ratio} > 2.2$): Divides the horizontal strip into functional zones (Left: Branding & Visuals, Center: Flexible Text Block, Right: Action CTA Buttons).
- **`grid`** ($0.8 \le \text{Aspect Ratio} \le 2.2$): Constructs a 2D split-pane arrangement (Left Pane: Hero visuals, Right Pane: Content column). If no hero visual exists, balances non-visual content across two side-by-side columns.

### Step 3: Hard Constraint Floors (`hardConstraintFloor`)
Shrinking may **never** violate physical usability floors:
- **Touch surfaces** (`touchOnly: true`): Interactive buttons enforce $\text{width} \ge \text{minTapTarget}$ and $\text{height} \ge \text{minTapTarget}$ (default 44px).
- **Far-viewing surfaces** (`viewingDistance: "far"`): Typography enforces $\text{fontSize} \ge \text{minTextSize}$ (default 24px, multiplied by 1.5× base).
- **Priority 1 elements**: Essential elements (`primary` headline, `action` CTA) are never dropped. If usable space cannot accommodate their hard floor, `resolveLayout` throws `LayoutError`.

### Step 4: Priority & Progressive Degradation Logic
When space is constrained, the resolver attempts an **8-stage priority-ordered degradation cascade**:

```
[Stage 1: Natural] ➔ [Stage 2: Shrink P3] ➔ [Stage 3: Reposition P3] ➔ [Stage 4: Drop P3]
                          │
                          ▼
[Stage 5: Shrink P2] ➔ [Stage 6: Reposition P2] ➔ [Stage 7: Drop P2] ➔ [Stage 8: Shrink P1 (Floors)]
```

| Stage | Name | Spacing | Priority 3 (Branding) | Priority 2 (Hero/Price) | Priority 1 (Headline/CTA) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `natural` | 16px pad / 12px gap | Natural full size | Natural full size | Natural full size |
| **2** | `shrink-p3` | 16px pad / 8px gap | **Shrunk** (compact size & font) | Natural full size | Natural full size |
| **3** | `reposition-p3` | 8px pad / 8px gap | **Repositioned** (compact slot) | Natural full size | Natural full size |
| **4** | `drop-p3` | 16px pad / 12px gap | **Dropped** (`visible: false`) | Natural full size | Natural full size |
| **5** | `shrink-p2` | 8px pad / 8px gap | **Dropped** | **Shrunk** (reduced height share/font) | Natural full size |
| **6** | `reposition-p2` | 8px pad / 4px gap | **Dropped** | **Repositioned** (compact layout) | Natural full size |
| **7** | `drop-p2` | 8px pad / 8px gap | **Dropped** | **Dropped** (`visible: false`) | Natural / Compact |
| **8** | `shrink-p1` | 4px pad / 4px gap | **Dropped** | **Dropped** | **Shrunk** to hard floors |

### Step 5: Structural Invariant Guarantee (`assertNoOverlapOrClip`)
At the end of every resolution pass, `assertNoOverlapOrClip` executes synchronously:
1. **Boundary Containment**: Asserts every visible element's bounding box $[x, y, x + w, y + h]$ is strictly inside $[safeLeft, safeTop, W - safeRight, H - safeBottom]$.
2. **Pairwise Collision Detection**: Evaluates all pairs of visible elements $(A, B)$ and asserts $\text{Intersection}(A, B) = \emptyset$. If any overlap is detected, a descriptive `LayoutError` is raised.

---

## 🔢 Concrete Number-Traced Resolution Walkthroughs

To demonstrate the exact math computed by the engine, here are end-to-end traces with actual pixel values:

### Example 1: Mobile Portrait ($390 \times 844$)

```
Input:
  AdSpec: [hero (P2), headline (P1), price (P2), cta (P1), logo (P3)]
  Surface: 390 × 844, safeArea: { top: 47, right: 0, bottom: 34, left: 0 }, touchOnly: true, minTapTarget: 48

1. Usable Bounds:
   W_avail = 390 - 0 - 0 = 390px
   H_avail = 844 - 47 - 34 = 763px

2. Axis Derivation:
   Aspect Ratio = 390 / 844 = 0.46 (< 0.8 ➔ "vertical" column stack)

3. Cascade Resolution:
   Stage 1 (Natural: padding 16px, gap 12px)
   contentWidth = 390 - 32 = 358px
   contentHeight = 763 - 32 = 731px

   - hero-image (hero, P2):
     height = floor(731 * 0.45) = 328px, width = 358px, x = 16px, y = 47 + 16 = 63px
   - headline (primary, P1):
     height = 38px, width = 358px, fontSize = 26px, x = 16px, y = 63 + 328 + 12 = 403px
   - price (secondary, P2):
     height = 28px, width = 358px, fontSize = 18px, x = 16px, y = 403 + 38 + 12 = 453px
   - cta (action, P1):
     width = 180px, height = 50px (≥ minTap 48px), fontSize = 16px
     x = 16 + floor((358 - 180) / 2) = 105px (Centered!), y = 453 + 28 + 12 = 493px
   - logo (branding, P3):
     width = 120px, height = 38px, fontSize = 16px
     x = 16 + floor((358 - 120) / 2) = 135px (Centered!), y = 493 + 50 + 12 = 555px

   Total Required Height = 328 + 38 + 28 + 50 + 38 + 4*12 = 530px ≤ 731px (Stage 1 SUCCEEDS)
   Result: All 5 elements visible at full natural scale. Zero overlaps, zero clipping.
```

### Example 2: Broadcast Lower-Third ($1920 \times 360$)

```
Input:
  AdSpec: [hero (P2), headline (P1), price (P2), cta (P1), logo (P3)]
  Surface: 1920 × 360, safeArea: { top: 24, right: 64, bottom: 24, left: 64 }, viewingDistance: "far", minTextSize: 24

1. Usable Bounds:
   W_avail = 1920 - 64 - 64 = 1792px
   H_avail = 360 - 24 - 24 = 312px

2. Axis Derivation:
   Aspect Ratio = 1920 / 360 = 5.33 (> 2.2 ➔ "horizontal-band" 3-zone flow)

3. Cascade Resolution:
   Stage 1 (Natural: padding 16px, gap 12px)
   contentWidth = 1792 - 32 = 1760px, contentHeight = 312 - 32 = 280px

   - Zone 1 (Left - Branding & Hero):
     logo: width = 100px, height = 36px, x = 64 + 16 = 80px, y = 24 + 16 + (280-36)/2 = 162px
     hero-image: width = 440px, height = 280px, x = 80 + 100 + 12 = 192px, y = 40px
   - Zone 3 (Right - Action CTA):
     cta: width = 150px, height = 48px, x = 80 + 1760 - 150 = 1690px, y = 40 + (280-48)/2 = 156px
   - Zone 2 (Middle - Flexible Text Area):
     middleWidth = 1760 - (100 + 440 + 150 + 3*12) = 1034px
     headline: width = 1034px, height = 46px, fontSize = 39px (26 * 1.5), x = 644px, y = 40px
     price: width = 1034px, height = 32px, fontSize = 27px (18 * 1.5), x = 644px, y = 90px

   Result: All elements positioned horizontally side-by-side with far-viewing typographic scaling.
```

### Example 3: Forced Degradation on Square Kiosk Tight ($320 \times 170$)

```
Input:
  AdSpec: [hero (P2), headline (P1), price (P2), cta (P1), logo (P3)]
  Surface: 320 × 170, safeArea: { top: 10, right: 10, bottom: 10, left: 10 }, touchOnly: true, minTapTarget: 44

1. Usable Bounds:
   W_avail = 320 - 20 = 300px, H_avail = 170 - 20 = 150px, Aspect Ratio = 1.88 ("grid")

2. Progressive Cascade Attempts:
   - Stage 1 (Natural): contentHeight 118px < required 184px (FAILS)
   - Stage 2 (Shrink P3): contentHeight 118px < required 158px (FAILS)
   - Stage 3 (Reposition P3): contentHeight 134px < required 158px (FAILS)
   - Stage 4 (Drop P3):
     logo (P3) ➔ DROPPED (visible: false, degraded: "dropped")
     Remaining: hero (P2), headline (P1), price (P2), cta (P1)
     Right column required height = 38 (headline) + 28 (price) + 44 (cta) + 2*12 (gaps) = 134px
     contentHeight in compact stage = 150 - 16 = 134px
     134px ≤ 134px (SUCCEEDS!)

   Result: Branding is dropped cleanly. Priority 1 headline and CTA remain fully visible, intact, and touch-compliant.
```

---

## 🛡️ TypeScript Design & Type Safety

The type system guarantees invalid specs and surface configurations are caught at compile-time or rejected with descriptive runtime errors:

```typescript
// Mapped conditional type intersection on defineSurface
export function defineSurface<const T extends SurfaceProfile>(
  profile: T &
    (T["touchOnly"] extends true ? { minTapTarget: number } : {}) &
    (T["viewingDistance"] extends "far" ? { minTextSize: number } : {})
): T;
```

### Compile-Time Guarantees
- Specifying `touchOnly: true` without `minTapTarget` causes an immediate TypeScript compiler error: `Property 'minTapTarget' is missing`.
- Specifying `viewingDistance: "far"` without `minTextSize` causes an immediate TypeScript compiler error: `Property 'minTextSize' is missing`.
- The `<const T>` generic modifier preserves literal string and numeric types.

### Runtime Defensive Validation
- `defineAd()`: Validates elements array is non-empty, element IDs are unique strings, roles belong to `ElementRole`, and priorities are strictly `1 | 2 | 3`.
- `defineSurface()`: Validates positive finite dimensions ($W > 0, H > 0$), asserts safe area insets are non-negative and do not exceed surface boundaries, and verifies positive numeric constraint values.

---

## 🔌 Extensibility & Decoupled Architecture

### Adding a New Surface Profile
Any new surface (e.g. an ultra-tall elevator display or automotive HUD) can be defined and resolved **without touching a single line of `resolver.ts`**:
```typescript
const inCarHUD = defineSurface({
  name: "In-Car Panoramic HUD",
  width: 2560,
  height: 720,
  safeArea: { top: 24, right: 60, bottom: 24, left: 60 },
  touchOnly: true,
  minTapTarget: 56,
});
// Resolves dynamically through continuous aspect ratio (2560/720 = 3.55 -> horizontal-band)
const layout = resolveLayout(mySpec, inCarHUD, domTextMeasurer);
```

### Adding a New Renderer (e.g. Canvas, SVG, WebGL)
`resolveLayout` outputs a plain, immutable `ResolvedLayout` array. Adding a new renderer requires zero changes to the resolver core:
```typescript
export interface ResolvedElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  visible: boolean;
  degraded?: "shrunk" | "repositioned" | "dropped";
}
```
This repository provides both `render-dom.ts` and `render-canvas.ts` as proof of renderer independence.

---

## ⚠️ Known Limitations

- **Fixed Semantic Roles**: The engine supports standard ad roles (`hero`, `primary`, `secondary`, `action`, `branding`).
- **Headless Node Text Measurement**: In headless Node environments (e.g. Vitest), character-width heuristics (`mockTextMeasurer`) are used. In browser environments, high-precision HTML5 Canvas `measureText` (`domTextMeasurer`) is used.
- **Transition Animations**: The DOM and Canvas renderers execute instantaneous coordinate updates; cross-axis transition animations between vastly different topologies (e.g. vertical to horizontal-band) are omitted to maintain zero layout logic in renderers.

---

## ⏱️ Time Spent Breakdown

**Total Time:** ~14 hours (spread over 4 days within the 3–5 day timeline)

| Phase / Day | Time Spent | Focus & Activities |
| :--- | :---: | :--- |
| **Day 1: Architecture & Type System** | ~3.5h | Designed the 4-layer resolution pipeline; implemented compile-time conditional type intersections (`defineSurface`) and runtime invariant validators (`defineAd`). Researched continuous aspect-ratio topology derivation. |
| **Day 2: Constraint Resolver & Cascade** | ~4.5h | Implemented the 8-stage progressive degradation cascade (`Shrink` → `Reposition` → `Drop`), hard constraint floors (`hardConstraintFloor`), text measurement heuristics, and structural collision detection (`assertNoOverlapOrClip`). |
| **Day 3: Automated Testing & Edge Cases** | ~2.5h | Authored 43 Vitest unit tests covering canonical surfaces, extreme/micro displays, multi-element groups, impossible constraint rejections, and unseen surface generalization. |
| **Day 4: Renderers, Interactive UI & Docs** | ~3.5h | Implemented zero-layout DOM and Canvas 2D renderers; built the interactive demo studio (`App.tsx`) with preset switcher, degradation toggles, and live custom surface builder; documented algorithm with number-traced walkthroughs in `README.md` and `ARCHITECTURE.md`. |

---

## 🤖 AI Usage & Tooling Disclosure

In accordance with assignment guidelines, AI tooling was leveraged transparently during this project:

- **Primary Tool**: **Google Antigravity (AGY)**
- **Scope & Application**:
  - **Edge-Case Ideation**: Stress-testing constraint boundaries (e.g., asymmetric safe areas exceeding surface bounds, touch floors under extreme degradation, far-viewing font multipliers).
  - **Test Fixture Generation**: Scaffolding repetitive test cases for unseen surfaces (automotive HUD, smart fridge, jumbotron) in `resolver.test.ts`.
  - **Documentation & Diagramming**: Formatted markdown tables, ASCII pipeline flowcharts, and number-traced walkthroughs in `README.md` and `ARCHITECTURE.md`.
  
