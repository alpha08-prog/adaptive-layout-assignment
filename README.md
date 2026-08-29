# Adaptive Layout Engine for Multi-Surface Ads

A pure TypeScript constraint resolution engine that dynamically resolves a single declarative ad specification across fundamentally distinct surfaces (varying aspect ratios, safe areas, touch targets, and viewing distances) — with **zero per-surface branching**.

---

## Key Highlights

- **Pure TypeScript Engine (`src/resolver.ts`)**: Completely decoupled from DOM, React, and CSS. Executes seamlessly in headless Node environments and in browsers.
- **Continuous Property Resolution**: Derives orientation (`vertical`, `horizontal-band`, `grid`) and element dimensions purely from continuous geometry ($W/H$ aspect ratio, safe area insets, touch constraints, viewing distance).
- **Deterministic Degradation Cascade**: When space is constrained, elements degrade systematically in priority order (Shrink $\rightarrow$ Compact $\rightarrow$ Drop lowest priority first). Priority 1 elements never drop.
- **Structural Invariant Guarantee (`assertNoOverlapOrClip`)**: Guarantees zero bounding-box collisions and zero clipping outside safe areas, enforced synchronously inside `resolveLayout`.
- **Zero-Layout DOM Renderer (`src/render-dom.ts`)**: Projects computed spatial coordinates directly to DOM styles without CSS media queries or CSS-driven layout calculations.
- **Interactive Multi-Surface Studio (`src/App.tsx`)**: Live playground featuring canonical surface presets, custom surface builder, and real-time layout inspectors.

---

## Quick Start

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation & Setup

```bash
# Clone repository and enter directory
cd adaptive-layout-assignment

# Install dependencies
npm install

# Start the local development studio
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to interact with the studio.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server with HMR |
| `npm run test` | Executes the Vitest unit test suite (32 headless tests) |
| `npm run typecheck` | Runs TypeScript type checker (`tsc -b --noEmit`) |
| `npm run build` | Compiles TypeScript and builds production distribution |
| `npm run preview` | Previews the production build locally |

---

## System Architecture Overview

```
 ┌───────────────────────────┐     ┌────────────────────────────┐
 │      Declarative Ad       │     │      Surface Profile       │
 │   Spec (`AdSpec`)         │     │    (`SurfaceProfile`)      │
 └─────────────┬─────────────┘     └─────────────┬──────────────┘
               │                                 │
               └───────────────┬─────────────────┘
                               ▼
               ┌─────────────────────────────────┐
               │    Pure TypeScript Resolver     │
               │   - Axis Derivation             │
               │   - Natural Sizing Engine       │
               │   - Degradation Cascade         │
               │   - Overlap / Clip Invariants   │
               └───────────────┬─────────────────┘
                               ▼
               ┌─────────────────────────────────┐
               │    Resolved Layout Output       │
               │      (`ResolvedLayout`)         │
               └───────────────┬─────────────────┘
                               ▼
               ┌─────────────────────────────────┐
               │   Renderer Layer (render-dom)   │
               │  - Pure Coordinate Projection   │
               └─────────────────────────────────┘
```

---

## Interactive Studio Features

The demo application (`src/App.tsx`) provides an interactive testbed to evaluate the layout engine across diverse surfaces:

1. **Preset Surface Switcher**:
   - **Mobile Portrait (390 × 844)**: Tall aspect ratio ($< 0.8$) resolved as a cohesive single-column vertical stack with touch-friendly CTA targets ($\ge 48\text{px}$).
   - **Mobile Landscape (844 × 390)**: Balanced landscape ratio resolved as a 2D split grid (Hero visual on left, content column on right).
   - **Broadcast Lower-Third (1920 × 360)**: Ultra-wide ratio ($> 2.2$) resolved as a 3-zone horizontal band with large typography scaling ($\ge 24\text{px}$) for far viewing distances.
   - **Square Kiosk (800 × 800)**: 1:1 aspect ratio resolved as a 2D split-pane arrangement.
   - **Square Kiosk Tight (360 × 240)**: Deliberately restricted surface demonstrating the deterministic degradation cascade by dropping the lowest-priority branding logo while keeping headline and CTA intact.

2. **Custom Surface Playground**:
   - Live numerical controls for `width`, `height`, and `safeArea` insets (`top`, `right`, `bottom`, `left`).
   - Toggles for `touchOnly` (with `minTapTarget` adjustment) and `viewingDistance` (`near` vs. `far` with `minTextSize` adjustment).
   - Real-time resolution testing on arbitrary, unseen 5th surfaces.

3. **Layout Output Inspector**:
   - Live breakdown of all spec elements displaying visibility, degradation mode (`NORMAL`, `SHRUNK`, `COMPACT`, `DROPPED`), dimensions, and exact pixel coordinates.

4. **Safe Area Inset Visualizer**:
   - Interactive toggle to display emerald dashed overlays representing physical safe boundaries.

---

## AI Tools Disclosure

In accordance with compliance and evaluation guidelines:
- **Antigravity (Google DeepMind)**: Used as the primary AI pair programming assistant for generating code, architecting type-level constraints (`defineSurface` conditional types), designing the mathematical degradation algorithm, and writing automated unit tests.
- **Claude (Anthropic)**: Consulted during initial design ideation for continuous aspect ratio thresholds and degradation priority rules.

---

## Known Limitations

- **Fixed Semantic Element Roles**: The current schema supports a predefined set of semantic roles (`hero`, `primary`, `secondary`, `action`, `branding`).
- **Headless Node Text Measurement**: In Node test environments, text measurement uses deterministic font-metric approximations (`mockTextMeasurer`). In browser environments, high-precision HTML5 Canvas `measureText` (`domTextMeasurer`) is used.
- **Transition Animations**: The DOM renderer focuses on instantaneous coordinate updates; CSS transition interpolations between vastly different layout topologies (e.g., vertical to horizontal-band) are omitted to keep the renderer zero-logic.

---

## Time Spent Breakdown

| Component / Area | Estimated Time | Focus |
| :--- | :--- | :--- |
| **Type Contracts & Validators** | ~1.0h | Conditional compile-time constraints & defensive runtime validation |
| **Constraint Resolver Core** | ~2.0h | Mathematical axis derivation & role natural sizing rules |
| **Degradation Cascade & Invariants** | ~2.5h | Priority-based relaxation ladder, hard constraint floors, collision checks |
| **Automated Test Suite** | ~1.5h | 32 Vitest unit tests covering edge cases & unseen surface generalization |
| **DOM Renderer & Studio UI** | ~2.0h | Zero-logic DOM projection, responsive viewport, custom surface builder |
| **Documentation & Polishing** | ~1.0h | Technical architecture documentation and verification |
| **Total** | **~10.0h** | |
