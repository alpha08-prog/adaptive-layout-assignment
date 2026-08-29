// render-dom.ts — Pure TypeScript DOM renderer converting ResolvedLayout into positioned DOM elements
import type { AdSpec, AdElement } from "./spec.ts";
import type { SurfaceProfile } from "./surfaces.ts";
import type { ResolvedLayout, ResolvedElement } from "./resolver.ts";

export interface RenderDOMOptions {
  showSafeAreas?: boolean;
}

/**
 * Creates and returns a positioned HTMLDivElement representing the resolved layout.
 *
 * Strict Architectural Guarantees:
 * - Direct mapping from ResolvedElement (left, top, width, height, fontSize) to inline style.
 * - Zero layout logic or media queries inside the renderer.
 * - Elements with visible: false are completely omitted from the DOM.
 * - Tailwind / CSS is used solely for visual chrome (borders, backgrounds, gradients, typography).
 */
export function createDOMRenderer(
  layout: ResolvedLayout,
  spec: AdSpec,
  surface: SurfaceProfile,
  options: RenderDOMOptions = {}
): HTMLElement {
  const container = document.createElement("div");
  container.className = "relative overflow-hidden select-none bg-slate-950 text-slate-100";
  container.style.width = `${surface.width}px`;
  container.style.height = `${surface.height}px`;
  container.style.position = "relative";
  container.style.boxSizing = "border-box";

  // Map elements by ID for content lookup
  const elementMap = new Map<string, AdElement>();
  for (const el of spec.elements) {
    elementMap.set(el.id, el);
  }

  // Safe area overlay (if enabled)
  if (options.showSafeAreas && surface.safeArea !== undefined) {
    const safeLeft = surface.safeArea.left ?? 0;
    const safeTop = surface.safeArea.top ?? 0;
    const safeRight = surface.safeArea.right ?? 0;
    const safeBottom = surface.safeArea.bottom ?? 0;

    const safeOverlay = document.createElement("div");
    safeOverlay.className = "absolute border-2 border-dashed border-emerald-500/40 pointer-events-none z-50";
    safeOverlay.style.left = `${safeLeft}px`;
    safeOverlay.style.top = `${safeTop}px`;
    safeOverlay.style.width = `${surface.width - safeLeft - safeRight}px`;
    safeOverlay.style.height = `${surface.height - safeTop - safeBottom}px`;
    safeOverlay.style.boxSizing = "border-box";

    const badge = document.createElement("span");
    badge.className = "absolute top-1 left-1.5 text-[10px] font-mono font-bold tracking-wider text-emerald-400/80 bg-slate-900/90 px-1 py-0.5 rounded border border-emerald-500/30";
    badge.textContent = "SAFE AREA";
    safeOverlay.appendChild(badge);

    container.appendChild(safeOverlay);
  }

  // Render only visible elements
  const visibleElements = layout.filter((e) => e.visible);

  for (const resolvedEl of visibleElements) {
    const adEl = elementMap.get(resolvedEl.id);
    const node = createDOMElementNode(resolvedEl, adEl);
    container.appendChild(node);
  }

  return container;
}

/**
 * Mounts or updates a resolved layout into an existing DOM container element.
 */
export function renderToDOM(
  layout: ResolvedLayout,
  spec: AdSpec,
  surface: SurfaceProfile,
  container: HTMLElement,
  options: RenderDOMOptions = {}
): void {
  // Clear previous rendered children
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const rendered = createDOMRenderer(layout, spec, surface, options);
  container.appendChild(rendered);
}

function createDOMElementNode(
  resolved: ResolvedElement,
  element?: AdElement
): HTMLElement {
  const role = element?.role ?? "primary";
  const type = element?.type ?? "text";
  const content = element?.content ?? resolved.id;

  let el: HTMLElement;

  if (type === "button" || role === "action") {
    el = document.createElement("button");
    el.setAttribute("type", "button");
    el.className =
      "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-semibold rounded-lg shadow-md shadow-blue-500/20 flex items-center justify-center cursor-pointer transition-transform duration-100 text-center select-none overflow-hidden text-ellipsis whitespace-nowrap px-3";
    const span = document.createElement("span");
    span.className = "truncate";
    span.textContent = content;
    el.appendChild(span);
  } else if (role === "hero") {
    el = document.createElement("div");
    el.className =
      "rounded-xl overflow-hidden shadow-md bg-slate-900 border border-slate-800 flex items-center justify-center relative";

    if (type === "image" && content.startsWith("http")) {
      const img = document.createElement("img");
      img.src = content;
      img.alt = "Hero visual";
      img.className = "w-full h-full object-cover";
      el.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className =
        "w-full h-full bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-3 text-center";
      placeholder.innerHTML = `
        <svg class="w-8 h-8 text-indigo-400/70 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="text-xs font-medium text-slate-400 truncate max-w-full">${content}</span>
      `;
      el.appendChild(placeholder);
    }
  } else if (role === "primary") {
    el = document.createElement("div");
    el.className = "font-bold text-slate-100 flex items-center tracking-tight overflow-hidden text-ellipsis leading-tight";
    const span = document.createElement("span");
    span.className = "line-clamp-2";
    span.textContent = content;
    el.appendChild(span);
  } else if (role === "secondary") {
    el = document.createElement("div");
    el.className = "font-semibold text-emerald-400 flex items-center tracking-normal overflow-hidden text-ellipsis";
    const span = document.createElement("span");
    span.className = "truncate";
    span.textContent = content;
    el.appendChild(span);
  } else if (role === "branding") {
    el = document.createElement("div");
    el.className =
      "font-bold tracking-widest text-slate-400 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 flex items-center justify-center text-center overflow-hidden uppercase";
    const span = document.createElement("span");
    span.className = "truncate";
    span.textContent = content;
    el.appendChild(span);
  } else {
    el = document.createElement("div");
    el.className = "text-slate-300 flex items-center overflow-hidden text-ellipsis";
    const span = document.createElement("span");
    span.className = "truncate";
    span.textContent = content;
    el.appendChild(span);
  }

  // Absolute positioning styles
  el.style.position = "absolute";
  el.style.left = `${resolved.x}px`;
  el.style.top = `${resolved.y}px`;
  el.style.width = `${resolved.width}px`;
  el.style.height = `${resolved.height}px`;
  el.style.boxSizing = "border-box";

  if (resolved.fontSize) {
    el.style.fontSize = `${resolved.fontSize}px`;
    el.style.lineHeight = `${Math.round(resolved.fontSize * 1.25)}px`;
  }

  return el;
}
