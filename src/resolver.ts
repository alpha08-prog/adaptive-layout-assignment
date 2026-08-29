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
 * Aspect ratio thresholds for deriving layout orientation:
 * - aspectRatio < 0.8: Tall surface -> "vertical" column stack.
 * - aspectRatio > 2.2: Ultra-wide surface -> "horizontal-band" flow.
 * - 0.8 <= aspectRatio <= 2.2: Balanced/Square -> "grid" 2D arrangement.
 */
export const PORTRAIT_ASPECT_THRESHOLD = 0.8;
export const ULTRA_WIDE_ASPECT_THRESHOLD = 2.2;

/**
 * Layout padding and gap constants (in pixels).
 * All element placement offsets and spacing derive from these named tokens.
 */
export const DEFAULT_PADDING = 16;
export const DEFAULT_GAP = 12;
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
 * Defines base font sizes, dimensional shares, and minimum physical bounds.
 */
export interface RoleNaturalConfig {
  baseFontSize?: number;
  heightShare?: number; // Share of available height (0-1)
  widthShare?: number;  // Share of available width (0-1)
  minHeight: number;
  minWidth: number;
  aspectRatio?: number; // Desired width/height ratio (e.g. 16/9 for hero image)
}

export const ROLE_NATURAL_SIZING: Record<ElementRole, RoleNaturalConfig> = {
  hero: {
    heightShare: 0.42,
    widthShare: 0.48,
    minHeight: 80,
    minWidth: 80,
    aspectRatio: 16 / 9,
  },
  primary: {
    baseFontSize: 24,
    minHeight: 28,
    minWidth: 80,
  },
  secondary: {
    baseFontSize: 16,
    minHeight: 20,
    minWidth: 60,
  },
  action: {
    baseFontSize: 16,
    minHeight: 44,
    minWidth: 120,
  },
  branding: {
    baseFontSize: 14,
    heightShare: 0.08,
    minHeight: 24,
    minWidth: 60,
    aspectRatio: 3 / 1,
  },
};

/**
 * Calculates the effective font size for a text or button element given surface viewing constraints.
 */
export function calculateFontSize(
  element: AdElement,
  surface: SurfaceProfile
): number | undefined {
  if (element.type !== "text" && element.type !== "button") {
    return undefined;
  }

  const roleConfig = ROLE_NATURAL_SIZING[element.role];
  let size = roleConfig.baseFontSize ?? 16;

  if (surface.viewingDistance === "far") {
    size = Math.round(size * FAR_VIEWING_TEXT_MULTIPLIER);
    const floor = surface.minTextSize ?? 24;
    size = Math.max(size, floor);
  } else if (surface.minTextSize !== undefined) {
    size = Math.max(size, surface.minTextSize);
  }

  return size;
}

/**
 * Primary layout resolution function.
 * Given an ad specification and surface profile, produces an immutable ResolvedLayout
 * with absolute coordinates and dimensions for every element.
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

  const contentX = safeLeft + DEFAULT_PADDING;
  const contentY = safeTop + DEFAULT_PADDING;
  const contentWidth = Math.max(0, surface.width - safeLeft - safeRight - DEFAULT_PADDING * 2);
  const contentHeight = Math.max(0, surface.height - safeTop - safeBottom - DEFAULT_PADDING * 2);

  const axis = deriveAxis(surface);

  // In Phase 2, order elements by priority ascending (priority 1 placed first)
  const elements = [...spec.elements].sort((a, b) => a.priority - b.priority);

  switch (axis) {
    case "vertical":
      return resolveVerticalLayout(elements, surface, contentX, contentY, contentWidth, contentHeight, measure);
    case "horizontal-band":
      return resolveHorizontalBandLayout(elements, surface, contentX, contentY, contentWidth, contentHeight, measure);
    case "grid":
      return resolveGridLayout(elements, surface, contentX, contentY, contentWidth, contentHeight, measure);
  }
}

/**
 * Resolves layout for portrait / vertical column flow.
 */
function resolveVerticalLayout(
  elements: AdElement[],
  surface: SurfaceProfile,
  contentX: number,
  contentY: number,
  contentWidth: number,
  contentHeight: number,
  measure: TextMeasurer
): ResolvedLayout {
  const resolved: ResolvedElement[] = [];
  let currentY = contentY;

  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;

  for (const element of elements) {
    const roleConfig = ROLE_NATURAL_SIZING[element.role];
    const fontSize = calculateFontSize(element, surface);

    let width = contentWidth;
    let height = roleConfig.minHeight;

    if (element.role === "hero") {
      const desiredHeight = Math.floor(contentHeight * (roleConfig.heightShare ?? 0.4));
      height = Math.max(roleConfig.minHeight, desiredHeight);
      width = contentWidth;
    } else if (element.type === "text") {
      const text = element.content ?? element.id;
      const textDim = measure(text, fontSize ?? 16);
      height = Math.max(roleConfig.minHeight, textDim.height + 4);
      width = contentWidth;
    } else if (element.type === "button" || element.role === "action") {
      height = Math.max(roleConfig.minHeight, minTap, 44);
      width = Math.min(contentWidth, Math.max(roleConfig.minWidth, 180));
    } else if (element.role === "branding") {
      height = Math.max(roleConfig.minHeight, 32);
      width = Math.min(contentWidth * 0.5, 120);
    }

    resolved.push({
      id: element.id,
      x: contentX,
      y: currentY,
      width,
      height,
      fontSize,
      visible: true,
    });

    currentY += height + DEFAULT_GAP;
  }

  return resolved;
}

/**
 * Resolves layout for ultra-wide / horizontal band flow.
 */
function resolveHorizontalBandLayout(
  elements: AdElement[],
  surface: SurfaceProfile,
  contentX: number,
  contentY: number,
  contentWidth: number,
  contentHeight: number,
  measure: TextMeasurer
): ResolvedLayout {
  const resolved: ResolvedElement[] = [];
  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;

  // Categorize elements by semantic role for horizontal band zones
  const heroElement = elements.find((e) => e.role === "hero");
  const actionElement = elements.find((e) => e.role === "action");
  const brandingElement = elements.find((e) => e.role === "branding");
  const textElements = elements.filter((e) => e.role === "primary" || e.role === "secondary");
  const otherElements = elements.filter(
    (e) => e !== heroElement && e !== actionElement && e !== brandingElement && !textElements.includes(e)
  );

  let currentX = contentX;

  // 1. Branding / Hero on the left
  if (brandingElement) {
    const fontSize = calculateFontSize(brandingElement, surface);
    const width = Math.min(100, Math.floor(contentWidth * 0.12));
    const height = Math.min(contentHeight, 40);
    const y = contentY + Math.floor((contentHeight - height) / 2);

    resolved.push({
      id: brandingElement.id,
      x: currentX,
      y,
      width,
      height,
      fontSize,
      visible: true,
    });
    currentX += width + DEFAULT_GAP;
  }

  if (heroElement) {
    const heroWidth = Math.min(
      Math.floor(contentHeight * (16 / 9)),
      Math.floor(contentWidth * 0.25)
    );
    const heroHeight = contentHeight;

    resolved.push({
      id: heroElement.id,
      x: currentX,
      y: contentY,
      width: heroWidth,
      height: heroHeight,
      visible: true,
    });
    currentX += heroWidth + DEFAULT_GAP;
  }

  // 2. Action CTA on the far right
  let rightReservedWidth = 0;
  let actionBox: ResolvedElement | null = null;

  if (actionElement) {
    const fontSize = calculateFontSize(actionElement, surface);
    const actionWidth = Math.max(140, minTap);
    const actionHeight = Math.max(44, minTap, Math.min(contentHeight, 50));
    const actionX = contentX + contentWidth - actionWidth;
    const actionY = contentY + Math.floor((contentHeight - actionHeight) / 2);

    actionBox = {
      id: actionElement.id,
      x: actionX,
      y: actionY,
      width: actionWidth,
      height: actionHeight,
      fontSize,
      visible: true,
    };
    rightReservedWidth = actionWidth + DEFAULT_GAP;
  }

  // 3. Text elements in the middle flexible section
  const middleWidth = Math.max(0, contentX + contentWidth - rightReservedWidth - currentX);
  let textY = contentY;

  for (const textEl of textElements) {
    const fontSize = calculateFontSize(textEl, surface);
    const roleConfig = ROLE_NATURAL_SIZING[textEl.role];
    const textDim = measure(textEl.content ?? textEl.id, fontSize ?? 16);
    const height = Math.max(roleConfig.minHeight, textDim.height + 2);

    resolved.push({
      id: textEl.id,
      x: currentX,
      y: textY,
      width: middleWidth,
      height,
      fontSize,
      visible: true,
    });
    textY += height + 4;
  }

  for (const otherEl of otherElements) {
    const fontSize = calculateFontSize(otherEl, surface);
    resolved.push({
      id: otherEl.id,
      x: currentX,
      y: textY,
      width: middleWidth,
      height: 30,
      fontSize,
      visible: true,
    });
    textY += 34;
  }

  if (actionBox) {
    resolved.push(actionBox);
  }

  return resolved;
}

/**
 * Resolves layout for square / 2D grid multi-column arrangement.
 */
function resolveGridLayout(
  elements: AdElement[],
  surface: SurfaceProfile,
  contentX: number,
  contentY: number,
  contentWidth: number,
  contentHeight: number,
  measure: TextMeasurer
): ResolvedLayout {
  const resolved: ResolvedElement[] = [];
  const minTap = surface.touchOnly ? (surface.minTapTarget ?? MIN_TOUCH_TARGET_DEFAULT) : 0;

  const heroElement = elements.find((e) => e.role === "hero");
  const nonHeroElements = elements.filter((e) => e !== heroElement);

  if (heroElement) {
    // 2-Pane split: Left Hero pane, Right Content column
    const heroWidth = Math.floor(contentWidth * 0.48);
    const heroHeight = contentHeight;

    resolved.push({
      id: heroElement.id,
      x: contentX,
      y: contentY,
      width: heroWidth,
      height: heroHeight,
      visible: true,
    });

    const colX = contentX + heroWidth + DEFAULT_GAP;
    const colWidth = Math.max(0, contentWidth - heroWidth - DEFAULT_GAP);
    let colY = contentY;

    for (const element of nonHeroElements) {
      const roleConfig = ROLE_NATURAL_SIZING[element.role];
      const fontSize = calculateFontSize(element, surface);

      let width = colWidth;
      let height = roleConfig.minHeight;

      if (element.type === "text") {
        const text = element.content ?? element.id;
        const textDim = measure(text, fontSize ?? 16);
        height = Math.max(roleConfig.minHeight, textDim.height + 4);
        width = colWidth;
      } else if (element.type === "button" || element.role === "action") {
        height = Math.max(roleConfig.minHeight, minTap, 44);
        width = Math.min(colWidth, Math.max(roleConfig.minWidth, 160));
      } else if (element.role === "branding") {
        height = Math.max(roleConfig.minHeight, 28);
        width = Math.min(colWidth * 0.5, 100);
      }

      resolved.push({
        id: element.id,
        x: colX,
        y: colY,
        width,
        height,
        fontSize,
        visible: true,
      });

      colY += height + DEFAULT_GAP;
    }
  } else {
    // Single column stack when no hero element is present
    let currentY = contentY;
    for (const element of elements) {
      const roleConfig = ROLE_NATURAL_SIZING[element.role];
      const fontSize = calculateFontSize(element, surface);
      const height = roleConfig.minHeight;

      resolved.push({
        id: element.id,
        x: contentX,
        y: currentY,
        width: contentWidth,
        height,
        fontSize,
        visible: true,
      });
      currentY += height + DEFAULT_GAP;
    }
  }

  return resolved;
}
