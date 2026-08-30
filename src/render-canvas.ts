// render-canvas.ts — Pure TypeScript Canvas 2D renderer converting ResolvedLayout into styled canvas drawings
import type { AdSpec, AdElement } from "./spec.ts";
import type { SurfaceProfile } from "./surfaces.ts";
import type { ResolvedLayout, ResolvedElement } from "./resolver.ts";

export interface RenderCanvasOptions {
  showSafeAreas?: boolean;
  devicePixelRatio?: number;
  onImageLoaded?: () => void;
}

// In-memory image cache for asynchronous canvas rendering
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Loads an image with in-memory caching and optional reload notification callback.
 */
function getCachedImage(src: string, onImageLoaded?: () => void): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  const existing = imageCache.get(src);
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0) {
      return existing;
    }
    return null;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  img.onload = () => {
    if (onImageLoaded) {
      onImageLoaded();
    }
  };
  imageCache.set(src, img);
  return null;
}

/**
 * Helper to draw a rounded rectangle path across all Canvas2D implementations.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * Wraps text into multiple lines bounded by maxWidth.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Renders a ResolvedLayout onto an existing CanvasRenderingContext2D.
 *
 * Strict Architectural Guarantees:
 * - Direct mapping from ResolvedElement (x, y, width, height, fontSize).
 * - Zero layout decisions made inside the renderer.
 * - Elements with visible: false are completely skipped.
 * - Same visual hierarchy and clean chrome as the DOM renderer.
 */
export function renderToCanvas(
  layout: ResolvedLayout,
  spec: AdSpec,
  surface: SurfaceProfile,
  ctx: CanvasRenderingContext2D,
  options: RenderCanvasOptions = {}
): void {
  const { width, height } = surface;

  // 1. Clear and render canvas background
  ctx.save();
  ctx.fillStyle = "#09090b"; // zinc-950
  ctx.fillRect(0, 0, width, height);

  // Surface boundary border
  ctx.strokeStyle = "rgba(63, 63, 70, 0.6)"; // zinc-700/60
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.restore();

  // 2. Safe area overlay (if enabled)
  if (options.showSafeAreas && surface.safeArea !== undefined) {
    const { top, right, bottom, left } = surface.safeArea;
    const safeW = width - left - right;
    const safeH = height - top - bottom;

    if (safeW > 0 && safeH > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)"; // emerald-500/40
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(left, top, safeW, safeH);
      ctx.setLineDash([]);

      // Safe area badge
      ctx.fillStyle = "rgba(24, 24, 27, 0.95)";
      drawRoundedRect(ctx, left + 6, top + 6, 72, 18, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#34d399"; // emerald-400
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("SAFE AREA", left + 10, top + 15);
      ctx.restore();
    }
  }

  // 3. Map ad elements by ID
  const elementMap = new Map<string, AdElement>();
  for (const el of spec.elements) {
    elementMap.set(el.id, el);
  }

  // 4. Render only visible elements
  const visibleElements = layout.filter((e) => e.visible);

  for (const resolvedEl of visibleElements) {
    const adEl = elementMap.get(resolvedEl.id);
    renderCanvasElement(ctx, resolvedEl, adEl, options.onImageLoaded);
  }
}

/**
 * Draws an individual resolved layout element according to its role and geometry.
 */
function renderCanvasElement(
  ctx: CanvasRenderingContext2D,
  resolved: ResolvedElement,
  element?: AdElement,
  onImageLoaded?: () => void
): void {
  const role = element?.role ?? "primary";
  const type = element?.type ?? "text";
  const content = element?.content ?? resolved.id;
  const { x, y, width, height } = resolved;
  const fontSize = resolved.fontSize ?? 16;

  ctx.save();

  switch (role) {
    case "hero": {
      // Hero image or styled placeholder
      drawRoundedRect(ctx, x, y, width, height, 12);
      ctx.clip();

      const img = type === "image" && content.startsWith("http")
        ? getCachedImage(content, onImageLoaded)
        : null;

      if (img) {
        // Draw image aspect-fill (cover)
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const targetAspect = width / height;
        let sWidth = img.naturalWidth;
        let sHeight = img.naturalHeight;
        let sX = 0;
        let sY = 0;

        if (imgAspect > targetAspect) {
          sWidth = img.naturalHeight * targetAspect;
          sX = (img.naturalWidth - sWidth) / 2;
        } else {
          sHeight = img.naturalWidth / targetAspect;
          sY = (img.naturalHeight - sHeight) / 2;
        }

        ctx.drawImage(img, sX, sY, sWidth, sHeight, x, y, width, height);
      } else {
        // Fallback hero visual placeholder
        ctx.fillStyle = "#18181b"; // zinc-900
        ctx.fillRect(x, y, width, height);

        // Icon representation
        ctx.fillStyle = "#71717a"; // zinc-500
        ctx.font = `bold ${Math.max(12, Math.min(20, Math.floor(height * 0.2)))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("IMAGE VISUAL", x + width / 2, y + height / 2);
      }

      // Border chrome
      ctx.strokeStyle = "rgba(63, 63, 70, 0.7)";
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, x, y, width, height, 12);
      ctx.stroke();
      break;
    }

    case "action": {
      // Clean CTA Button
      drawRoundedRect(ctx, x, y, width, height, 8);
      ctx.fillStyle = "#2563eb"; // blue-600
      ctx.fill();

      // Border highlight
      ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Centered Button text
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(content, x + width / 2, y + height / 2, width - 16);
      break;
    }

    case "primary": {
      // Primary Headline with multi-line wrapping and clean clipping
      ctx.fillStyle = "#fafafa"; // zinc-50
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const lineHeight = Math.round(fontSize * 1.2);
      const lines = wrapText(ctx, content, width);

      // Render up to max visible lines
      const maxLines = Math.max(1, Math.floor(height / lineHeight));
      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        let lineText = lines[i]!;
        if (i === maxLines - 1 && lines.length > maxLines) {
          // Truncate last visible line if text overflows
          lineText = `${lineText}...`;
        }
        ctx.fillText(lineText, x, y + i * lineHeight, width);
      }
      break;
    }

    case "secondary": {
      // Secondary text / price
      ctx.fillStyle = "#34d399"; // emerald-400
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(content, x, y + height / 2, width);
      break;
    }

    case "branding": {
      // Branding badge
      drawRoundedRect(ctx, x, y, width, height, 6);
      ctx.fillStyle = "rgba(39, 39, 42, 0.9)"; // zinc-800/90
      ctx.fill();

      ctx.strokeStyle = "rgba(82, 82, 91, 0.8)"; // zinc-600/80
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#d4d4d8"; // zinc-300
      ctx.font = `600 ${fontSize}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(content.toUpperCase(), x + width / 2, y + height / 2, width - 8);
      break;
    }

    default: {
      ctx.fillStyle = "#d4d4d8";
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(content, x, y + height / 2, width);
      break;
    }
  }

  ctx.restore();
}

/**
 * Creates and appends a styled Canvas element with high-DPI scaling.
 */
export function renderLayoutToCanvasElement(
  canvas: HTMLCanvasElement,
  layout: ResolvedLayout,
  spec: AdSpec,
  surface: SurfaceProfile,
  options: RenderCanvasOptions = {}
): void {
  const dpr = options.devicePixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const { width, height } = surface;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);
  renderToCanvas(layout, spec, surface, ctx, options);
  ctx.restore();
}
