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
 * - Same visual hierarchy and chrome as the DOM renderer.
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
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#020617"); // slate-950
  bgGrad.addColorStop(0.5, "#0f172a"); // slate-900
  bgGrad.addColorStop(1, "#020617"); // slate-950
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Surface boundary border
  ctx.strokeStyle = "rgba(51, 65, 85, 0.6)"; // slate-700/60
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
      ctx.strokeStyle = "rgba(16, 185, 129, 0.5)"; // emerald-500/50
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(left, top, safeW, safeH);
      ctx.setLineDash([]);

      // Safe area badge
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      drawRoundedRect(ctx, left + 6, top + 6, 76, 18, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#6ee7b7"; // emerald-300
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("SAFE AREA", left + 12, top + 15);
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
        // Fallback gradient hero visual placeholder
        const heroGrad = ctx.createLinearGradient(x, y, x + width, y + height);
        heroGrad.addColorStop(0, "#1e1b4b"); // indigo-950
        heroGrad.addColorStop(0.5, "#0f172a"); // slate-900
        heroGrad.addColorStop(1, "#020617"); // slate-950
        ctx.fillStyle = heroGrad;
        ctx.fillRect(x, y, width, height);

        // Icon representation
        ctx.fillStyle = "#818cf8"; // indigo-400
        ctx.font = `bold ${Math.max(12, Math.min(24, Math.floor(height * 0.2)))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✦ HERO VISUAL", x + width / 2, y + height / 2);
      }

      // Border chrome
      ctx.strokeStyle = "rgba(51, 65, 85, 0.7)";
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, x, y, width, height, 12);
      ctx.stroke();
      break;
    }

    case "action": {
      // CTA Button with gradient, shadow, and centered text
      drawRoundedRect(ctx, x, y, width, height, 8);

      const btnGrad = ctx.createLinearGradient(x, y, x + width, y);
      btnGrad.addColorStop(0, "#2563eb"); // blue-600
      btnGrad.addColorStop(0.5, "#4f46e5"); // indigo-600
      btnGrad.addColorStop(1, "#4338ca"); // indigo-700
      ctx.fillStyle = btnGrad;
      ctx.fill();

      // Border highlight
      ctx.strokeStyle = "rgba(165, 180, 252, 0.35)"; // indigo-300/35
      ctx.lineWidth = 1;
      ctx.stroke();

      // Centered Button text
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(content, x + width / 2, y + height / 2, width - 16);
      break;
    }

    case "primary": {
      // Primary Headline with multi-line wrapping and robust clipping
      ctx.fillStyle = "#f8fafc"; // slate-50
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const lineHeight = Math.round(fontSize * 1.2);
      const lines = wrapText(ctx, content, width);
      const maxLines = Math.max(1, Math.floor(height / lineHeight));
      const renderedLines = lines.slice(0, maxLines);

      let currentY = y + Math.max(0, (height - renderedLines.length * lineHeight) / 2);

      for (let i = 0; i < renderedLines.length; i++) {
        let line = renderedLines[i]!;
        if (i === renderedLines.length - 1 && lines.length > maxLines) {
          line = `${line.replace(/\.+$/, "")}...`;
        }
        ctx.fillText(line, x, currentY, width);
        currentY += lineHeight;
      }
      break;
    }

    case "secondary": {
      // Secondary Price / Feature
      ctx.fillStyle = "#34d399"; // emerald-400
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(content, x, y + height / 2, width);
      break;
    }

    case "branding": {
      // Branding badge pill
      drawRoundedRect(ctx, x, y, width, height, 6);
      ctx.fillStyle = "rgba(30, 41, 59, 0.9)"; // slate-800/90
      ctx.fill();

      ctx.strokeStyle = "rgba(71, 85, 105, 0.8)"; // slate-600/80
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#cbd5e1"; // slate-300
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(content.toUpperCase(), x + width / 2, y + height / 2, width - 12);
      break;
    }

    default: {
      // General text fallback
      ctx.fillStyle = "#cbd5e1";
      ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(content, x, y + height / 2, width);
      break;
    }
  }

  ctx.restore();
}

/**
 * Creates and returns an HTMLCanvasElement rendered with the resolved layout at native device pixel ratio.
 */
export function createCanvasRenderer(
  layout: ResolvedLayout,
  spec: AdSpec,
  surface: SurfaceProfile,
  options: RenderCanvasOptions = {}
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  renderLayoutToCanvasElement(canvas, layout, spec, surface, options);
  return canvas;
}

/**
 * Renders or updates a ResolvedLayout onto an HTMLCanvasElement with high-DPI scaling.
 */
export function renderLayoutToCanvasElement(
  canvas: HTMLCanvasElement,
  layout: ResolvedLayout,
  spec: AdSpec,
  surface: SurfaceProfile,
  options: RenderCanvasOptions = {}
): void {
  const dpr = options.devicePixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const width = surface.width;
  const height = surface.height;

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
