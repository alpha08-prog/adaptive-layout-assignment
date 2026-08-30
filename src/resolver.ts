import type { AdSpec, AdElement, ElementRole } from "./spec.ts";
import type { SurfaceProfile } from "./surfaces.ts";

export type TextMeasurer = (
  text: string,
  fontSize: number
) => { width: number; height: number };

/**
 * Deterministic mock text measurer for headless Node environments and tests.
 */
export const mockTextMeasurer: TextMeasurer = (text: string, fontSize: number) => {
  const chars = text ? text.length : 0;
  return {
    width: Math.ceil(chars * fontSize * 0.6),
    height: Math.ceil(fontSize * 1.2),
  };
};

/**
 * In-browser canvas-based text measurer with headless fallback.
 */
let cachedCanvasCtx: CanvasRenderingContext2D | null = null;
export const domTextMeasurer: TextMeasurer = (text: string, fontSize: number) => {
  if (typeof document !== "undefined") {
    try {
      if (!cachedCanvasCtx) {
        const canvas = document.createElement("canvas");
        cachedCanvasCtx = canvas.getContext("2d");
      }
      if (cachedCanvasCtx) {
        cachedCanvasCtx.font = `${fontSize}px sans-serif`;
        const metrics = cachedCanvasCtx.measureText(text || "");
        return {
          width: Math.ceil(metrics.width),
          height: Math.ceil(fontSize * 1.2),
        };
      }
    } catch {
      // Fallback if canvas context fails
    }
  }
  return mockTextMeasurer(text, fontSize);
};

export type DegradeKind = "shrunk" | "repositioned" | "dropped";

export interface ResolvedElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  visible: boolean;
  degraded?: DegradeKind;
}

export type ResolvedLayout = ResolvedElement[];

/**
 * Custom Error subclass thrown when layout constraints cannot be satisfied,
 * or when an overlap / clip invariant is violated.
 */
export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

/**
 * Aspect ratio thresholds for deriving layout orientation:
 * - aspectRatio < 0.8: Tall surface -> "vertical" column stack.
 * - aspectRatio > 2.2: Ultra-wide surface -> "horizontal-band" flow.
 * - 0.8 <= aspectRatio <= 2.2: Balanced/Square -> "grid" 2D arrangement.
 */
export const PORTRAIT_ASPECT_THRESHOLD = 0.8;
export const ULTRA_WIDE_ASPECT_THRESHOLD = 2.2;

/**
 * Spacing constants (in pixels).
 */
export const DEFAULT_PADDING = 16;
export const COMPACT_PADDING = 8;
export const MIN_PADDING = 4;

export const DEFAULT_GAP = 12;
export const COMPACT_GAP = 8;
export const MIN_GAP = 4;

export const MIN_TOUCH_TARGET_DEFAULT = 44;
export const MIN_TEXT_SIZE_DEFAULT = 12;
export const FAR_VIEWING_TEXT_MULTIPLIER = 1.5;

export type LayoutAxis = "vertical" | "horizontal-band" | "grid";

/**
 * Derives the layout orientation axis purely from continuous surface geometry
 * (width / height aspect ratio), completely independent of surface identity or name.
 */
export function deriveAxis(surface: SurfaceProfile): LayoutAxis {
  const aspectRatio = surface.width / surface.height;
  if (aspectRatio < PORTRAIT_ASPECT_THRESHOLD) {
    return "vertical";
  }
  if (aspectRatio > ULTRA_WIDE_ASPECT_THRESHOLD) {
    return "horizontal-band";
  }
  return "grid";
}

/**
 * Declarative natural sizing configuration keyed by semantic element role.
 */
export interface RoleNaturalConfig {
  baseFontSize?: number;
  heightShare?: number;
  widthShare?: number;
  minHeight: number;
  minWidth: number;
  aspectRatio?: number;
}

export const ROLE_NATURAL_SIZING: Record<ElementRole, RoleNaturalConfig> = {
  hero: {
    heightShare: 0.45,
    widthShare: 0.48,
    minHeight: 80,
    minWidth: 80,
    aspectRatio: 16 / 9,
  },
  primary: {
    baseFontSize: 26,
    minHeight: 38,
    minWidth: 80,
  },
  secondary: {
    baseFontSize: 18,
    minHeight: 28,
    minWidth: 60,
  },
  action: {
    baseFontSize: 16,
    minHeight: 50,
    minWidth: 130,
  },
  branding: {
    baseFontSize: 16,
    heightShare: 0.12,
    minHeight: 38,
    minWidth: 70,
    aspectRatio: 3 / 1,
  },
};

/**
 * Hard constraint floor definition for an element on a given surface.
 * Shrinking may NEVER violate these minimum dimensions or font size.
 */
export interface ElementConstraintFloor {
  minWidth: number;
  minHeight: number;
  minFontSize?: number;
}

/**
 * Computes the absolute hard constraint floor that an element can never shrink below.
 */
export function hardConstraintFloor(
  element: AdElement,
  surface: SurfaceProfile
): ElementConstraintFloor {
  const isInteractive = element.type === "button" || element.role === "action";
  const isFar = surface.viewingDistance === "far";

  let minTap = 0;
  if (surface.touchOnly) {
    minTap = surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT;
  }

  let minFontSize: number | undefined;
  if (element.type === "text" || element.type === "button") {
    if (isFar) {
      minFontSize = surface.minTextSize ?? 24;
    } else {
      minFontSize = surface.minTextSize ?? MIN_TEXT_SIZE_DEFAULT;
    }
  }

  if (isInteractive) {
    const minW = Math.max(minTap, 80);
    const minH = Math.max(minTap, 36);
    return {
      minWidth: minW,
      minHeight: minH,
      minFontSize,
    };
  }

  if (element.role === "hero") {
    return {
      minWidth: 60,
      minHeight: 40,
    };
  }

  if (element.role === "branding") {
    return {
      minWidth: 40,
      minHeight: 20,
      minFontSize: isFar ? (surface.minTextSize ?? 24) : 10,
    };
  }

  // Text elements
  const fontH = minFontSize ? Math.ceil(minFontSize * 1.2) : 16;
  return {
    minWidth: 40,
    minHeight: fontH,
    minFontSize,
  };
}

/**
 * Calculates the target font size for a text or button element.
 */
export function calculateFontSize(
  element: AdElement,
  surface: SurfaceProfile,
  shrink = false
): number | undefined {
  if (element.type !== "text" && element.type !== "button") {
    return undefined;
  }

  const roleConfig = ROLE_NATURAL_SIZING[element.role];
  let size = roleConfig?.baseFontSize ?? 16;

  if (shrink) {
    size = Math.max(12, Math.floor(size * 0.85));
  }

  if (surface.viewingDistance === "far") {
    size = Math.round(size * FAR_VIEWING_TEXT_MULTIPLIER);
    const floor = surface.minTextSize ?? 24;
    size = Math.max(size, floor);
  } else if (surface.minTextSize !== undefined) {
    size = Math.max(size, surface.minTextSize);
  }

  const floor = hardConstraintFloor(element, surface).minFontSize;
  if (floor !== undefined) {
    size = Math.max(size, floor);
  }

  return size;
}

/**
 * Asserts that all visible elements in a resolved layout are fully contained
 * within the surface's safe area and do not overlap one another.
 * Throws a LayoutError if any invariant is violated.
 */
export function assertNoOverlapOrClip(
  layout: ResolvedLayout,
  surface: SurfaceProfile
): void {
  const safeLeft = surface.safeArea?.left ?? 0;
  const safeTop = surface.safeArea?.top ?? 0;
  const safeRight = surface.safeArea?.right ?? 0;
  const safeBottom = surface.safeArea?.bottom ?? 0;

  const minX = safeLeft;
  const minY = safeTop;
  const maxX = surface.width - safeRight;
  const maxY = surface.height - safeBottom;

  const visibleElements = layout.filter((e) => e.visible);
  const EPSILON = 0.01;

  // 1. Safe area boundary and dimension check
  for (const el of visibleElements) {
    if (el.width <= 0 || el.height <= 0) {
      throw new LayoutError(
        `Element "${el.id}" has invalid non-positive dimensions (${el.width}x${el.height}).`
      );
    }

    const elRight = el.x + el.width;
    const elBottom = el.y + el.height;

    if (
      el.x < minX - EPSILON ||
      el.y < minY - EPSILON ||
      elRight > maxX + EPSILON ||
      elBottom > maxY + EPSILON
    ) {
      throw new LayoutError(
        `Element "${el.id}" bounds [x: ${el.x}, y: ${el.y}, w: ${el.width}, h: ${el.height}] clip outside safe area bounds [minX: ${minX}, minY: ${minY}, maxX: ${maxX}, maxY: ${maxY}].`
      );
    }
  }

  // 2. Overlap check between all pairs of visible elements
  for (let i = 0; i < visibleElements.length; i++) {
    for (let j = i + 1; j < visibleElements.length; j++) {
      const a = visibleElements[i]!;
      const b = visibleElements[j]!;

      const aRight = a.x + a.width;
      const aBottom = a.y + a.height;
      const bRight = b.x + b.width;
      const bBottom = b.y + b.height;

      const horizontalOverlap = a.x < bRight - EPSILON && aRight > b.x + EPSILON;
      const verticalOverlap = a.y < bBottom - EPSILON && aBottom > b.y + EPSILON;

      if (horizontalOverlap && verticalOverlap) {
        throw new LayoutError(
          `Layout collision detected: element "${a.id}" [x: ${a.x}, y: ${a.y}, w: ${a.width}, h: ${a.height}] overlaps with element "${b.id}" [x: ${b.x}, y: ${b.y}, w: ${b.width}, h: ${b.height}].`
        );
      }
    }
  }
}

/**
 * Main resolution engine entry point.
 * Resolves layout with priority-based degradation cascade and enforces the overlap/clip invariant.
 */
export function resolveLayout(
  spec: AdSpec,
  surface: SurfaceProfile,
  measure: TextMeasurer
): ResolvedLayout {
  const safeLeft = surface.safeArea?.left ?? 0;
  const safeTop = surface.safeArea?.top ?? 0;
  const safeRight = surface.safeArea?.right ?? 0;
  const safeBottom = surface.safeArea?.bottom ?? 0;

  const rawAvailWidth = surface.width - safeLeft - safeRight;
  const rawAvailHeight = surface.height - safeTop - safeBottom;

  if (rawAvailWidth <= 0 || rawAvailHeight <= 0) {
    throw new LayoutError(
      `Surface "${surface.name}" safe area leaves no usable area (${rawAvailWidth}x${rawAvailHeight}).`
    );
  }

  // Pre-check priority 1 elements hard floors
  const priority1Elements = spec.elements.filter((e) => e.priority === 1);
  for (const p1 of priority1Elements) {
    const floor = hardConstraintFloor(p1, surface);
    if (floor.minWidth > rawAvailWidth || floor.minHeight > rawAvailHeight) {
      throw new LayoutError(
        `Priority 1 element "${p1.id}" floor (${floor.minWidth}x${floor.minHeight}) exceeds usable surface bounds (${rawAvailWidth}x${rawAvailHeight}).`
      );
    }
  }

  const axis = deriveAxis(surface);

  let layout: ResolvedLayout;
  switch (axis) {
    case "vertical":
      layout = resolveVerticalWithCascade(spec.elements, surface, measure);
      break;
    case "horizontal-band":
      layout = resolveHorizontalBandWithCascade(spec.elements, surface, measure);
      break;
    case "grid":
      layout = resolveGridWithCascade(spec.elements, surface, measure);
      break;
  }

  // Strict structural invariant guarantee
  assertNoOverlapOrClip(layout, surface);

  return layout;
}

// ---------------------------------------------------------------------------
// Cascade Stage Definition & Pipeline
// ---------------------------------------------------------------------------

export interface CascadeStage {
  name: string;
  padding: number;
  gap: number;
  shrinkP3?: boolean;
  repositionP3?: boolean;
  dropP3?: boolean;
  shrinkP2?: boolean;
  repositionP2?: boolean;
  dropP2?: boolean;
  shrinkP1?: boolean;
}

/**
 * 8-stage progressive degradation cascade:
 * Natural -> Shrink P3 -> Reposition P3 -> Drop P3 -> Shrink P2 -> Reposition P2 -> Drop P2 -> Shrink P1 (Hard floors)
 */
export const STANDARD_CASCADE_STAGES: CascadeStage[] = [
  // 1. Natural full sizing
  { name: "natural", padding: DEFAULT_PADDING, gap: DEFAULT_GAP },

  // 2. Shrink lowest priority (P3 branding scaled down)
  { name: "shrink-p3", padding: DEFAULT_PADDING, gap: COMPACT_GAP, shrinkP3: true },

  // 3. Reposition lowest priority (P3 branding relocated to compact strip)
  { name: "reposition-p3", padding: COMPACT_PADDING, gap: COMPACT_GAP, shrinkP3: true, repositionP3: true },

  // 4. Drop lowest priority (P3 branding dropped, P1 & P2 natural)
  { name: "drop-p3", padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: true },

  // 5. Shrink medium priority (P3 dropped, P2 hero/secondary shrunk)
  { name: "shrink-p2", padding: COMPACT_PADDING, gap: COMPACT_GAP, dropP3: true, shrinkP2: true },

  // 6. Reposition medium priority (P3 dropped, P2 repositioned to compact slots)
  { name: "reposition-p2", padding: COMPACT_PADDING, gap: MIN_GAP, dropP3: true, shrinkP2: true, repositionP2: true },

  // 7. Drop medium priority (P3 and P2 dropped, P1 natural/compact)
  { name: "drop-p2", padding: COMPACT_PADDING, gap: COMPACT_GAP, dropP3: true, dropP2: true },

  // 8. Shrink essential Priority 1 elements to hard constraint floors
  { name: "shrink-p1", padding: MIN_PADDING, gap: MIN_GAP, dropP3: true, dropP2: true, shrinkP1: true },
];

/**
 * Helper to determine an element's degradation kind under a cascade stage.
 */
function getElementDegradation(
  element: AdElement,
  stage: CascadeStage
): DegradeKind | undefined {
  if (element.priority === 3) {
    if (stage.dropP3) return "dropped";
    if (stage.repositionP3) return "repositioned";
    if (stage.shrinkP3) return "shrunk";
    return undefined;
  }

  if (element.priority === 2) {
    if (stage.dropP2) return "dropped";
    if (stage.repositionP2) return "repositioned";
    if (stage.shrinkP2) return "shrunk";
    return undefined;
  }

  if (element.priority === 1) {
    if (stage.shrinkP1) return "shrunk";
    return undefined;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// 1. Vertical Layout Resolution
// ---------------------------------------------------------------------------

function resolveVerticalWithCascade(
  elements: AdElement[],
  surface: SurfaceProfile,
  measure: TextMeasurer
): ResolvedLayout {
  const safeLeft = surface.safeArea?.left ?? 0;
  const safeTop = surface.safeArea?.top ?? 0;
  const safeRight = surface.safeArea?.right ?? 0;
  const safeBottom = surface.safeArea?.bottom ?? 0;

  const availWidth = surface.width - safeLeft - safeRight;
  const availHeight = surface.height - safeTop - safeBottom;

  for (const stage of STANDARD_CASCADE_STAGES) {
    const layout = tryVerticalPlacement(
      elements,
      surface,
      stage,
      measure,
      availWidth,
      availHeight,
      safeLeft,
      safeTop
    );
    if (layout) {
      return layout;
    }
  }

  throw new LayoutError(
    `Cannot fit required priority 1 elements within vertical surface "${surface.name}" (${surface.width}x${surface.height}).`
  );
}

function tryVerticalPlacement(
  elements: AdElement[],
  surface: SurfaceProfile,
  stage: CascadeStage,
  measure: TextMeasurer,
  availWidth: number,
  availHeight: number,
  safeLeft: number,
  safeTop: number
): ResolvedLayout | null {
  const contentWidth = availWidth - stage.padding * 2;
  const contentHeight = availHeight - stage.padding * 2;

  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const resolved: ResolvedElement[] = [];
  const activeElements: AdElement[] = [];

  for (const el of elements) {
    const degradation = getElementDegradation(el, stage);
    if (degradation === "dropped") {
      resolved.push({
        id: el.id,
        x: safeLeft + stage.padding,
        y: safeTop + stage.padding,
        width: 0,
        height: 0,
        visible: false,
        degraded: "dropped",
      });
    } else {
      activeElements.push(el);
    }
  }

  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;
  const elementBoxes: {
    element: AdElement;
    width: number;
    height: number;
    fontSize?: number;
    degraded?: DegradeKind;
  }[] = [];
  let requiredHeight = 0;

  for (const el of activeElements) {
    const roleConfig = ROLE_NATURAL_SIZING[el.role];
    const floor = hardConstraintFloor(el, surface);
    const degraded = getElementDegradation(el, stage);
    const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
    const fontSize = calculateFontSize(el, surface, isShrunk);

    let w = contentWidth;
    let h = roleConfigHeight(el, floor, fontSize, minTap, isShrunk, measure, contentWidth);

    if (el.role === "hero") {
      const share = isShrunk ? 0.28 : (roleConfig?.heightShare ?? 0.45);
      const desiredH = Math.floor(contentHeight * share);
      h = Math.max(floor.minHeight, desiredH);
      w = contentWidth;
    } else if (el.type === "button" || el.role === "action") {
      w = Math.min(contentWidth, Math.max(floor.minWidth, isShrunk ? 140 : 180));
    } else if (el.role === "branding") {
      w = isShrunk ? Math.min(contentWidth * 0.4, 90) : Math.min(contentWidth * 0.5, 120);
      h = isShrunk ? Math.max(floor.minHeight, 22) : h;
    }

    if (w > contentWidth || h > contentHeight) {
      return null;
    }

    elementBoxes.push({ element: el, width: w, height: h, fontSize, degraded });
    requiredHeight += h;
  }

  requiredHeight += Math.max(0, elementBoxes.length - 1) * stage.gap;

  if (requiredHeight > contentHeight) {
    return null;
  }

  let currentY = safeTop + stage.padding;
  for (const box of elementBoxes) {
    // Horizontally center buttons and branding if smaller than content width
    let elementX = safeLeft + stage.padding;
    if (
      box.element.type === "button" ||
      box.element.role === "action" ||
      box.element.role === "branding"
    ) {
      elementX += Math.floor((contentWidth - box.width) / 2);
    }

    resolved.push({
      id: box.element.id,
      x: elementX,
      y: currentY,
      width: box.width,
      height: box.height,
      fontSize: box.fontSize,
      visible: true,
      degraded: box.degraded,
    });
    currentY += box.height + stage.gap;
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// 2. Horizontal-Band Layout Resolution (Generic Multi-Element Support)
// ---------------------------------------------------------------------------

function resolveHorizontalBandWithCascade(
  elements: AdElement[],
  surface: SurfaceProfile,
  measure: TextMeasurer
): ResolvedLayout {
  const safeLeft = surface.safeArea?.left ?? 0;
  const safeTop = surface.safeArea?.top ?? 0;
  const safeRight = surface.safeArea?.right ?? 0;
  const safeBottom = surface.safeArea?.bottom ?? 0;

  const availWidth = surface.width - safeLeft - safeRight;
  const availHeight = surface.height - safeTop - safeBottom;

  for (const stage of STANDARD_CASCADE_STAGES) {
    const layout = tryHorizontalPlacement(
      elements,
      surface,
      stage,
      measure,
      availWidth,
      availHeight,
      safeLeft,
      safeTop
    );
    if (layout) {
      return layout;
    }
  }

  throw new LayoutError(
    `Cannot fit required priority 1 elements within horizontal-band surface "${surface.name}" (${surface.width}x${surface.height}).`
  );
}

function tryHorizontalPlacement(
  elements: AdElement[],
  surface: SurfaceProfile,
  stage: CascadeStage,
  measure: TextMeasurer,
  availWidth: number,
  availHeight: number,
  safeLeft: number,
  safeTop: number
): ResolvedLayout | null {
  const contentWidth = availWidth - stage.padding * 2;
  const contentHeight = availHeight - stage.padding * 2;

  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const resolved: ResolvedElement[] = [];
  const activeElements: AdElement[] = [];

  for (const el of elements) {
    const degradation = getElementDegradation(el, stage);
    if (degradation === "dropped") {
      resolved.push({
        id: el.id,
        x: safeLeft + stage.padding,
        y: safeTop + stage.padding,
        width: 0,
        height: 0,
        visible: false,
        degraded: "dropped",
      });
    } else {
      activeElements.push(el);
    }
  }

  // Categorize elements generically (supporting 0, 1, or multiple per category)
  const brandingElements = activeElements.filter((e) => e.role === "branding");
  const visualElements = activeElements.filter(
    (e) => e.role === "hero" || (e.type === "image" && e.role !== "branding")
  );
  const actionElements = activeElements.filter(
    (e) => e.role === "action" || e.type === "button"
  );
  const textElements = activeElements.filter(
    (e) => !brandingElements.includes(e) && !visualElements.includes(e) && !actionElements.includes(e)
  );

  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;
  let currentX = safeLeft + stage.padding;

  // 1. Place Branding Elements on the Left
  for (const brandingEl of brandingElements) {
    const floor = hardConstraintFloor(brandingEl, surface);
    const degraded = getElementDegradation(brandingEl, stage);
    const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
    const fontSize = calculateFontSize(brandingEl, surface, isShrunk);

    const bw = Math.max(floor.minWidth, Math.min(100, Math.floor(contentWidth * (isShrunk ? 0.09 : 0.12))));
    const bh = Math.max(floor.minHeight, Math.min(contentHeight, isShrunk ? 24 : 36));
    const by = safeTop + stage.padding + Math.floor((contentHeight - bh) / 2);

    resolved.push({
      id: brandingEl.id,
      x: currentX,
      y: by,
      width: bw,
      height: bh,
      fontSize,
      visible: true,
      degraded,
    });
    currentX += bw + stage.gap;
  }

  // 2. Place Visual/Hero Elements
  if (visualElements.length > 0) {
    const totalVisualWidthShare = Math.min(
      contentWidth * (stage.shrinkP2 ? 0.2 : 0.28),
      contentHeight * (16 / 9) * visualElements.length
    );
    const singleVisualWidth = Math.floor(
      (totalVisualWidthShare - (visualElements.length - 1) * stage.gap) / visualElements.length
    );

    for (const visualEl of visualElements) {
      const floor = hardConstraintFloor(visualEl, surface);
      const degraded = getElementDegradation(visualEl, stage);
      const vw = Math.max(floor.minWidth, singleVisualWidth);
      const vh = contentHeight;

      if (vw > contentWidth) return null;

      resolved.push({
        id: visualEl.id,
        x: currentX,
        y: safeTop + stage.padding,
        width: vw,
        height: vh,
        visible: true,
        degraded,
      });
      currentX += vw + stage.gap;
    }
  }

  // 3. Calculate and Reserve Right Action Elements Area
  const actionBoxes: ResolvedElement[] = [];
  let rightReservedWidth = 0;

  if (actionElements.length > 0) {
    let actionCursorX = safeLeft + stage.padding + contentWidth;

    for (let i = actionElements.length - 1; i >= 0; i--) {
      const actionEl = actionElements[i]!;
      const floor = hardConstraintFloor(actionEl, surface);
      const degraded = getElementDegradation(actionEl, stage);
      const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
      const fontSize = calculateFontSize(actionEl, surface, isShrunk);

      const aw = Math.max(floor.minWidth, minTap, isShrunk ? 120 : 150);
      const ah = Math.max(floor.minHeight, minTap, Math.min(contentHeight, 48));
      const ax = actionCursorX - aw;
      const ay = safeTop + stage.padding + Math.floor((contentHeight - ah) / 2);

      actionBoxes.unshift({
        id: actionEl.id,
        x: ax,
        y: ay,
        width: aw,
        height: ah,
        fontSize,
        visible: true,
        degraded,
      });

      actionCursorX -= aw + stage.gap;
      rightReservedWidth += aw + (i > 0 ? stage.gap : 0);
    }
  }

  // 4. Middle Flexible Text Area
  const rightBoundary = safeLeft + stage.padding + contentWidth - rightReservedWidth - (actionElements.length > 0 ? stage.gap : 0);
  const middleWidth = rightBoundary - currentX;

  if (middleWidth < 40 && textElements.length > 0) {
    return null;
  }

  let textY = safeTop + stage.padding;
  for (const textEl of textElements) {
    const floor = hardConstraintFloor(textEl, surface);
    const degraded = getElementDegradation(textEl, stage);
    const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
    const fontSize = calculateFontSize(textEl, surface, isShrunk);
    const th = roleConfigHeight(textEl, floor, fontSize, minTap, isShrunk, measure, middleWidth);

    if (textY + th > safeTop + stage.padding + contentHeight + 0.01) {
      return null;
    }

    resolved.push({
      id: textEl.id,
      x: currentX,
      y: textY,
      width: middleWidth,
      height: th,
      fontSize,
      visible: true,
      degraded,
    });
    textY += th + 4;
  }

  for (const box of actionBoxes) {
    resolved.push(box);
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// 3. Grid / 2D Split-Pane Layout Resolution (Generic Multi-Element Support)
// ---------------------------------------------------------------------------

function resolveGridWithCascade(
  elements: AdElement[],
  surface: SurfaceProfile,
  measure: TextMeasurer
): ResolvedLayout {
  const safeLeft = surface.safeArea?.left ?? 0;
  const safeTop = surface.safeArea?.top ?? 0;
  const safeRight = surface.safeArea?.right ?? 0;
  const safeBottom = surface.safeArea?.bottom ?? 0;

  const availWidth = surface.width - safeLeft - safeRight;
  const availHeight = surface.height - safeTop - safeBottom;

  for (const stage of STANDARD_CASCADE_STAGES) {
    const layout = tryGridPlacement(
      elements,
      surface,
      stage,
      measure,
      availWidth,
      availHeight,
      safeLeft,
      safeTop
    );
    if (layout) {
      return layout;
    }
  }

  throw new LayoutError(
    `Cannot fit required priority 1 elements within grid surface "${surface.name}" (${surface.width}x${surface.height}).`
  );
}

function tryGridPlacement(
  elements: AdElement[],
  surface: SurfaceProfile,
  stage: CascadeStage,
  measure: TextMeasurer,
  availWidth: number,
  availHeight: number,
  safeLeft: number,
  safeTop: number
): ResolvedLayout | null {
  const contentWidth = availWidth - stage.padding * 2;
  const contentHeight = availHeight - stage.padding * 2;

  if (contentWidth <= 0 || contentHeight <= 0) return null;

  const resolved: ResolvedElement[] = [];
  const activeElements: AdElement[] = [];

  for (const el of elements) {
    const degradation = getElementDegradation(el, stage);
    if (degradation === "dropped") {
      resolved.push({
        id: el.id,
        x: safeLeft + stage.padding,
        y: safeTop + stage.padding,
        width: 0,
        height: 0,
        visible: false,
        degraded: "dropped",
      });
    } else {
      activeElements.push(el);
    }
  }

  const visualElements = activeElements.filter(
    (e) => e.role === "hero" || (e.type === "image" && e.role !== "branding")
  );
  const nonVisualElements = activeElements.filter((e) => !visualElements.includes(e));
  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;

  if (visualElements.length > 0) {
    // 2D Split Pane: Visuals on Left Pane, Content Column on Right Pane
    const isShrunkHero = Boolean(stage.shrinkP2 || stage.repositionP2);
    const heroShare = isShrunkHero ? 0.38 : 0.48;
    const totalVisualWidth = Math.floor(contentWidth * heroShare);

    const colX = safeLeft + stage.padding + totalVisualWidth + stage.gap;
    const colWidth = contentWidth - totalVisualWidth - stage.gap;

    if (colWidth < 50) return null;

    // Check right column elements fit
    const elementBoxes: {
      element: AdElement;
      width: number;
      height: number;
      fontSize?: number;
      degraded?: DegradeKind;
    }[] = [];
    let requiredColHeight = 0;

    for (const el of nonVisualElements) {
      const floor = hardConstraintFloor(el, surface);
      const degraded = getElementDegradation(el, stage);
      const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
      const fontSize = calculateFontSize(el, surface, isShrunk);
      let w = colWidth;
      let h = roleConfigHeight(el, floor, fontSize, minTap, isShrunk, measure, colWidth);

      if (el.role === "branding") {
        w = isShrunk ? Math.min(colWidth * 0.5, 80) : Math.min(colWidth * 0.6, 100);
        h = isShrunk ? 20 : h;
      } else if (el.type === "button" || el.role === "action") {
        w = Math.min(colWidth, Math.max(floor.minWidth, isShrunk ? 130 : 160));
      }

      elementBoxes.push({ element: el, width: w, height: h, fontSize, degraded });
      requiredColHeight += h;
    }

    requiredColHeight += Math.max(0, elementBoxes.length - 1) * stage.gap;

    if (requiredColHeight > contentHeight) {
      return null;
    }

    // Place Visual Elements in Left Pane (divide height if multiple visuals exist)
    const singleVisualHeight = Math.floor(
      (contentHeight - (visualElements.length - 1) * stage.gap) / visualElements.length
    );

    let visualY = safeTop + stage.padding;
    for (const visualEl of visualElements) {
      const floor = hardConstraintFloor(visualEl, surface);
      const degraded = getElementDegradation(visualEl, stage);

      if (totalVisualWidth < floor.minWidth || singleVisualHeight < floor.minHeight) {
        return null;
      }

      resolved.push({
        id: visualEl.id,
        x: safeLeft + stage.padding,
        y: visualY,
        width: totalVisualWidth,
        height: singleVisualHeight,
        visible: true,
        degraded,
      });
      visualY += singleVisualHeight + stage.gap;
    }

    // Place Content Elements in Right Pane
    let colY = safeTop + stage.padding;
    for (const box of elementBoxes) {
      resolved.push({
        id: box.element.id,
        x: colX,
        y: colY,
        width: box.width,
        height: box.height,
        fontSize: box.fontSize,
        visible: true,
        degraded: box.degraded,
      });
      colY += box.height + stage.gap;
    }
  } else {
    // No visual element: On a square/balanced grid surface, arrange into 2 balanced side-by-side columns if possible
    const canDoTwoColumns = contentWidth >= 280 && nonVisualElements.length >= 2;

    if (canDoTwoColumns) {
      const colW = Math.floor((contentWidth - stage.gap) / 2);
      const half = Math.ceil(nonVisualElements.length / 2);
      const leftElements = nonVisualElements.slice(0, half);
      const rightElements = nonVisualElements.slice(half);

      let leftY = safeTop + stage.padding;
      for (const el of leftElements) {
        const floor = hardConstraintFloor(el, surface);
        const degraded = getElementDegradation(el, stage);
        const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
        const fontSize = calculateFontSize(el, surface, isShrunk);
        const h = roleConfigHeight(el, floor, fontSize, minTap, isShrunk, measure, colW);

        if (leftY + h > safeTop + stage.padding + contentHeight + 0.01) return null;

        resolved.push({
          id: el.id,
          x: safeLeft + stage.padding,
          y: leftY,
          width: colW,
          height: h,
          fontSize,
          visible: true,
          degraded: degraded ?? (stage.repositionP2 || stage.repositionP3 ? "repositioned" : undefined),
        });
        leftY += h + stage.gap;
      }

      let rightY = safeTop + stage.padding;
      for (const el of rightElements) {
        const floor = hardConstraintFloor(el, surface);
        const degraded = getElementDegradation(el, stage);
        const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
        const fontSize = calculateFontSize(el, surface, isShrunk);
        const h = roleConfigHeight(el, floor, fontSize, minTap, isShrunk, measure, colW);

        if (rightY + h > safeTop + stage.padding + contentHeight + 0.01) return null;

        resolved.push({
          id: el.id,
          x: safeLeft + stage.padding + colW + stage.gap,
          y: rightY,
          width: colW,
          height: h,
          fontSize,
          visible: true,
          degraded: degraded ?? (stage.repositionP2 || stage.repositionP3 ? "repositioned" : undefined),
        });
        rightY += h + stage.gap;
      }
    } else {
      // Single column fallback for narrow grid
      let currentY = safeTop + stage.padding;
      for (const el of nonVisualElements) {
        const floor = hardConstraintFloor(el, surface);
        const degraded = getElementDegradation(el, stage);
        const isShrunk = Boolean(degraded === "shrunk" || degraded === "repositioned" || stage.shrinkP1);
        const fontSize = calculateFontSize(el, surface, isShrunk);
        const h = roleConfigHeight(el, floor, fontSize, minTap, isShrunk, measure, contentWidth);
        const w = contentWidth;

        if (currentY + h > safeTop + stage.padding + contentHeight + 0.01) {
          return null;
        }

        resolved.push({
          id: el.id,
          x: safeLeft + stage.padding,
          y: currentY,
          width: w,
          height: h,
          fontSize,
          visible: true,
          degraded,
        });
        currentY += h + stage.gap;
      }
    }
  }

  return resolved;
}

function roleConfigHeight(
  el: AdElement,
  floor: ElementConstraintFloor,
  fontSize: number | undefined,
  minTap: number,
  shrink: boolean,
  measure: TextMeasurer,
  availableWidth?: number
): number {
  const roleConfig = ROLE_NATURAL_SIZING[el.role];
  if (el.type === "text") {
    const dim = measure(el.content ?? el.id, fontSize ?? 16);
    let lines = 1;
    if (el.role === "primary" && availableWidth && availableWidth > 0 && dim.width > availableWidth) {
      lines = Math.min(2, Math.max(1, Math.ceil(dim.width / availableWidth)));
    }
    const textH = lines * dim.height + 4;
    return Math.max(floor.minHeight, shrink ? 0 : (roleConfig?.minHeight ?? 24), textH);
  }
  if (el.type === "button" || el.role === "action") {
    return Math.max(floor.minHeight, minTap, shrink ? 40 : (roleConfig?.minHeight ?? 44));
  }
  if (el.role === "branding") {
    return Math.max(floor.minHeight, shrink ? 20 : (roleConfig?.minHeight ?? 30));
  }
  return Math.max(floor.minHeight, shrink ? 0 : (roleConfig?.minHeight ?? 24));
}
