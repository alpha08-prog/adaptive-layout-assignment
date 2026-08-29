// resolver.ts — Pure TypeScript constraint resolution engine
import type { AdSpec, AdElement, ElementRole } from "./spec.ts";
import type { SurfaceProfile } from "./surfaces.ts";
import type { TextMeasurer } from "./measure.ts";

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
  let size = roleConfig.baseFontSize ?? 16;

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
// Cascade Implementations (Shrink -> Compact -> Drop in Priority Order)
// ---------------------------------------------------------------------------

/**
 * Vertical / Portrait placement with priority-based degradation cascade.
 */
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

  // Progressive degradation cascade in priority order:
  // 1. Natural sizing
  // 2. Drop lowest priority (Priority 3, e.g. branding)
  // 3. Drop medium priority (Priority 2, e.g. price/hero)
  // 4. Shrink essential Priority 1 elements to hard floors
  const cascadeStages = [
    { padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: false, dropP2: false, shrink: false },
    { padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: true, dropP2: false, shrink: false },
    { padding: COMPACT_PADDING, gap: COMPACT_GAP, dropP3: true, dropP2: true, shrink: false },
    { padding: MIN_PADDING, gap: MIN_GAP, dropP3: true, dropP2: true, shrink: true },
  ];

  for (const stage of cascadeStages) {
    const layout = tryVerticalPlacement(elements, surface, stage, measure, availWidth, availHeight, safeLeft, safeTop);
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
  stage: { padding: number; gap: number; dropP3: boolean; dropP2: boolean; shrink: boolean },
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
    if (el.priority === 3 && stage.dropP3) {
      resolved.push({
        id: el.id,
        x: safeLeft + stage.padding,
        y: safeTop + stage.padding,
        width: 0,
        height: 0,
        visible: false,
        degraded: "dropped",
      });
    } else if (el.priority === 2 && stage.dropP2) {
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
  const elementBoxes: { element: AdElement; width: number; height: number; fontSize?: number; degraded?: DegradeKind }[] = [];
  let requiredHeight = 0;

  for (const el of activeElements) {
    const roleConfig = ROLE_NATURAL_SIZING[el.role];
    const floor = hardConstraintFloor(el, surface);
    const fontSize = calculateFontSize(el, surface, stage.shrink);

    let w = contentWidth;
    let h = roleConfigHeight(el, floor, fontSize, minTap, stage.shrink, measure);
    let degraded: DegradeKind | undefined = stage.shrink ? "shrunk" : undefined;

    if (el.role === "hero") {
      const share = stage.shrink ? 0.3 : (roleConfig.heightShare ?? 0.45);
      const desiredH = Math.floor(contentHeight * share);
      h = Math.max(floor.minHeight, desiredH);
      w = contentWidth;
    } else if (el.type === "button" || el.role === "action") {
      w = Math.min(contentWidth, Math.max(floor.minWidth, 180));
    } else if (el.role === "branding") {
      w = Math.min(contentWidth * 0.5, 120);
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
    resolved.push({
      id: box.element.id,
      x: safeLeft + stage.padding,
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

/**
 * Horizontal-Band placement with priority-based degradation cascade.
 */
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

  const cascadeStages = [
    { padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: false, dropP2: false, shrink: false },
    { padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: true, dropP2: false, shrink: false },
    { padding: COMPACT_PADDING, gap: COMPACT_GAP, dropP3: true, dropP2: true, shrink: false },
    { padding: MIN_PADDING, gap: MIN_GAP, dropP3: true, dropP2: true, shrink: true },
  ];

  for (const stage of cascadeStages) {
    const layout = tryHorizontalPlacement(elements, surface, stage, measure, availWidth, availHeight, safeLeft, safeTop);
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
  stage: { padding: number; gap: number; dropP3: boolean; dropP2: boolean; shrink: boolean },
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
    if (el.priority === 3 && stage.dropP3) {
      resolved.push({
        id: el.id,
        x: safeLeft + stage.padding,
        y: safeTop + stage.padding,
        width: 0,
        height: 0,
        visible: false,
        degraded: "dropped",
      });
    } else if (el.priority === 2 && stage.dropP2) {
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

  const heroElement = activeElements.find((e) => e.role === "hero");
  const actionElement = activeElements.find((e) => e.role === "action");
  const brandingElement = activeElements.find((e) => e.role === "branding");
  const textElements = activeElements.filter((e) => e.role === "primary" || e.role === "secondary");

  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;
  let currentX = safeLeft + stage.padding;

  // 1. Branding on far left if active
  if (brandingElement) {
    const floor = hardConstraintFloor(brandingElement, surface);
    const fontSize = calculateFontSize(brandingElement, surface, stage.shrink);
    const bw = Math.max(floor.minWidth, Math.min(100, Math.floor(contentWidth * 0.12)));
    const bh = Math.max(floor.minHeight, Math.min(contentHeight, stage.shrink ? 24 : 36));
    const by = safeTop + stage.padding + Math.floor((contentHeight - bh) / 2);

    resolved.push({
      id: brandingElement.id,
      x: currentX,
      y: by,
      width: bw,
      height: bh,
      fontSize,
      visible: true,
      degraded: stage.shrink ? "shrunk" : undefined,
    });
    currentX += bw + stage.gap;
  }

  // 2. Hero image
  if (heroElement) {
    const floor = hardConstraintFloor(heroElement, surface);
    const heroH = contentHeight;
    const heroW = Math.max(
      floor.minWidth,
      Math.min(Math.floor(contentHeight * (16 / 9)), Math.floor(contentWidth * 0.25))
    );

    resolved.push({
      id: heroElement.id,
      x: currentX,
      y: safeTop + stage.padding,
      width: heroW,
      height: heroH,
      visible: true,
      degraded: stage.shrink ? "shrunk" : undefined,
    });
    currentX += heroW + stage.gap;
  }

  // 3. Action button on the far right
  let rightReservedWidth = 0;
  let actionBox: ResolvedElement | null = null;

  if (actionElement) {
    const floor = hardConstraintFloor(actionElement, surface);
    const fontSize = calculateFontSize(actionElement, surface, stage.shrink);
    const aw = Math.max(floor.minWidth, minTap, stage.shrink ? 120 : 150);
    const ah = Math.max(floor.minHeight, minTap, Math.min(contentHeight, 48));
    const ax = safeLeft + stage.padding + contentWidth - aw;
    const ay = safeTop + stage.padding + Math.floor((contentHeight - ah) / 2);

    actionBox = {
      id: actionElement.id,
      x: ax,
      y: ay,
      width: aw,
      height: ah,
      fontSize,
      visible: true,
      degraded: stage.shrink ? "shrunk" : undefined,
    };
    rightReservedWidth = aw + stage.gap;
  }

  // 4. Middle flexible text area
  const middleWidth = safeLeft + stage.padding + contentWidth - rightReservedWidth - currentX;
  if (middleWidth < 40 && textElements.length > 0) {
    return null;
  }

  let textY = safeTop + stage.padding;
  for (const textEl of textElements) {
    const floor = hardConstraintFloor(textEl, surface);
    const fontSize = calculateFontSize(textEl, surface, stage.shrink);
    const dim = measure(textEl.content ?? textEl.id, fontSize ?? 16);
    const th = Math.max(floor.minHeight, dim.height + 2);

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
      degraded: stage.shrink ? "shrunk" : undefined,
    });
    textY += th + 4;
  }

  if (actionBox) {
    resolved.push(actionBox);
  }

  return resolved;
}

/**
 * Grid / 2D split-pane placement with priority-based degradation cascade.
 */
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

  const cascadeStages = [
    { padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: false, dropP2: false, shrink: false },
    { padding: DEFAULT_PADDING, gap: DEFAULT_GAP, dropP3: true, dropP2: false, shrink: false },
    { padding: COMPACT_PADDING, gap: COMPACT_GAP, dropP3: true, dropP2: true, shrink: false },
    { padding: MIN_PADDING, gap: MIN_GAP, dropP3: true, dropP2: true, shrink: true },
  ];

  for (const stage of cascadeStages) {
    const layout = tryGridPlacement(elements, surface, stage, measure, availWidth, availHeight, safeLeft, safeTop);
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
  stage: { padding: number; gap: number; dropP3: boolean; dropP2: boolean; shrink: boolean },
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
    if (el.priority === 3 && stage.dropP3) {
      resolved.push({
        id: el.id,
        x: safeLeft + stage.padding,
        y: safeTop + stage.padding,
        width: 0,
        height: 0,
        visible: false,
        degraded: "dropped",
      });
    } else if (el.priority === 2 && stage.dropP2) {
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

  const heroElement = activeElements.find((e) => e.role === "hero");
  const nonHeroElements = activeElements.filter((e) => e !== heroElement);
  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;

  if (heroElement) {
    const heroFloor = hardConstraintFloor(heroElement, surface);
    const heroShare = stage.shrink ? 0.4 : 0.48;
    const heroWidth = Math.max(heroFloor.minWidth, Math.floor(contentWidth * heroShare));
    const heroHeight = contentHeight;

    const colX = safeLeft + stage.padding + heroWidth + stage.gap;
    const colWidth = contentWidth - heroWidth - stage.gap;

    if (colWidth < 50) return null;

    const elementBoxes: { element: AdElement; width: number; height: number; fontSize?: number; degraded?: DegradeKind }[] = [];
    let requiredColHeight = 0;

    for (const el of nonHeroElements) {
      const floor = hardConstraintFloor(el, surface);
      const fontSize = calculateFontSize(el, surface, stage.shrink);
      let w = colWidth;
      let h = roleConfigHeight(el, floor, fontSize, minTap, stage.shrink, measure);
      let degraded: DegradeKind | undefined = stage.shrink ? "shrunk" : undefined;

      if (el.role === "branding") {
        w = Math.min(colWidth * 0.6, 100);
      } else if (el.type === "button" || el.role === "action") {
        w = Math.min(colWidth, Math.max(floor.minWidth, 160));
      }

      elementBoxes.push({ element: el, width: w, height: h, fontSize, degraded });
      requiredColHeight += h;
    }

    requiredColHeight += Math.max(0, elementBoxes.length - 1) * stage.gap;

    if (requiredColHeight > contentHeight) {
      return null;
    }

    // Place hero
    resolved.push({
      id: heroElement.id,
      x: safeLeft + stage.padding,
      y: safeTop + stage.padding,
      width: heroWidth,
      height: heroHeight,
      visible: true,
      degraded: stage.shrink ? "shrunk" : undefined,
    });

    // Place non-hero column
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
    // Single column stack without hero
    let currentY = safeTop + stage.padding;
    for (const el of nonHeroElements) {
      const floor = hardConstraintFloor(el, surface);
      const fontSize = calculateFontSize(el, surface, stage.shrink);
      const h = roleConfigHeight(el, floor, fontSize, minTap, stage.shrink, measure);
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
        degraded: stage.shrink ? "shrunk" : undefined,
      });
      currentY += h + stage.gap;
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
  measure: TextMeasurer
): number {
  const roleConfig = ROLE_NATURAL_SIZING[el.role];
  if (el.type === "text") {
    const dim = measure(el.content ?? el.id, fontSize ?? 16);
    return Math.max(floor.minHeight, shrink ? 0 : roleConfig.minHeight, dim.height + 4);
  }
  if (el.type === "button" || el.role === "action") {
    return Math.max(floor.minHeight, minTap, shrink ? 40 : roleConfig.minHeight);
  }
  if (el.role === "branding") {
    return Math.max(floor.minHeight, shrink ? 20 : roleConfig.minHeight);
  }
  return Math.max(floor.minHeight, shrink ? 0 : roleConfig.minHeight);
}
