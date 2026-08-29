import { useState, useMemo, useRef, useEffect } from "react";
import { defineAd, type AdSpec } from "./spec.ts";
import { defineSurface, type SurfaceProfile } from "./surfaces.ts";
import {
  resolveLayout,
  deriveAxis,
  domTextMeasurer,
  type ResolvedLayout,
} from "./resolver.ts";
import { renderToDOM } from "./render-dom.ts";
import { renderLayoutToCanvasElement } from "./render-canvas.ts";

// Canonical Demo Ad Spec
const demoAdSpec: AdSpec = defineAd({
  elements: [
    {
      id: "hero-image",
      type: "image",
      role: "hero",
      priority: 2,
      content: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
    },
    {
      id: "headline",
      type: "text",
      role: "primary",
      priority: 1,
      content: "Aura Noise-Cancelling Headphones",
    },
    {
      id: "price",
      type: "text",
      role: "secondary",
      priority: 2,
      content: "$299 — Premium Sound",
    },
    {
      id: "cta",
      type: "button",
      role: "action",
      priority: 1,
      content: "Buy Now",
    },
    {
      id: "logo",
      type: "image",
      role: "branding",
      priority: 3,
      content: "AURA AUDIO",
    },
  ],
});

// Canonical Demo Surface Profiles
const mobilePortrait = defineSurface({
  name: "Mobile Portrait",
  width: 390,
  height: 844,
  safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
  touchOnly: true,
  minTapTarget: 48,
});

const mobileLandscape = defineSurface({
  name: "Mobile Landscape",
  width: 844,
  height: 390,
  safeArea: { top: 0, right: 47, bottom: 21, left: 47 },
  touchOnly: true,
  minTapTarget: 48,
});

const broadcastLowerThird = defineSurface({
  name: "Broadcast Lower-Third",
  width: 1920,
  height: 360,
  safeArea: { top: 24, right: 64, bottom: 24, left: 64 },
  viewingDistance: "far",
  minTextSize: 24,
});

const squareKiosk = defineSurface({
  name: "Square Kiosk",
  width: 800,
  height: 800,
  safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
  touchOnly: true,
  minTapTarget: 48,
});

const squareKioskTight = defineSurface({
  name: "Square Kiosk (Tight)",
  width: 360,
  height: 240,
  safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
  touchOnly: true,
  minTapTarget: 44,
});

const PRESET_SURFACES: { id: string; label: string; icon: string; surface: SurfaceProfile; desc: string }[] = [
  {
    id: "mobile-portrait",
    label: "Mobile Portrait",
    icon: "📱",
    surface: mobilePortrait,
    desc: "390 × 844 • Touch (48px) • Vertical Stack",
  },
  {
    id: "mobile-landscape",
    label: "Mobile Landscape",
    icon: "🔄",
    surface: mobileLandscape,
    desc: "844 × 390 • Touch (48px) • 2D Grid Split",
  },
  {
    id: "broadcast-lt",
    label: "Broadcast Lower-Third",
    icon: "📺",
    surface: broadcastLowerThird,
    desc: "1920 × 360 • Far View (24px) • Horizontal Band",
  },
  {
    id: "square-kiosk",
    label: "Square Kiosk",
    icon: "🖥️",
    surface: squareKiosk,
    desc: "800 × 800 • Touch (48px) • 2D Split Grid",
  },
  {
    id: "kiosk-tight",
    label: "Square Kiosk (Tight)",
    icon: "⚠️",
    surface: squareKioskTight,
    desc: "360 × 240 • Forced Degradation (Drops Branding)",
  },
  {
    id: "custom",
    label: "Custom Surface",
    icon: "⚙️",
    surface: squareKiosk,
    desc: "Live Arbitrary Geometry & Constraints",
  },
];

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("mobile-portrait");
  const [showSafeAreas, setShowSafeAreas] = useState<boolean>(true);

  // Custom surface form state
  const [customName, setCustomName] = useState("Custom Live Surface");
  const [customWidth, setCustomWidth] = useState(1400);
  const [customHeight, setCustomHeight] = useState(400);
  const [customSafeTop, setCustomSafeTop] = useState(16);
  const [customSafeRight, setCustomSafeRight] = useState(32);
  const [customSafeBottom, setCustomSafeBottom] = useState(16);
  const [customSafeLeft, setCustomSafeLeft] = useState(32);
  const [customTouchOnly, setCustomTouchOnly] = useState(false);
  const [customMinTap, setCustomMinTap] = useState(44);
  const [customViewingDistance, setCustomViewingDistance] = useState<"near" | "far">("near");
  const [customMinTextSize, setCustomMinTextSize] = useState(20);

  const [rendererType, setRendererType] = useState<"dom" | "canvas">("dom");
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Active surface computation
  const activeSurface = useMemo<SurfaceProfile | null>(() => {
    if (selectedPresetId !== "custom") {
      const found = PRESET_SURFACES.find((p) => p.id === selectedPresetId);
      return found ? found.surface : mobilePortrait;
    }

    try {
      if (customTouchOnly && customViewingDistance === "far") {
        return defineSurface({
          name: customName,
          width: Number(customWidth),
          height: Number(customHeight),
          safeArea: {
            top: Number(customSafeTop),
            right: Number(customSafeRight),
            bottom: Number(customSafeBottom),
            left: Number(customSafeLeft),
          },
          touchOnly: true,
          minTapTarget: Number(customMinTap),
          viewingDistance: "far",
          minTextSize: Number(customMinTextSize),
        });
      } else if (customTouchOnly) {
        return defineSurface({
          name: customName,
          width: Number(customWidth),
          height: Number(customHeight),
          safeArea: {
            top: Number(customSafeTop),
            right: Number(customSafeRight),
            bottom: Number(customSafeBottom),
            left: Number(customSafeLeft),
          },
          touchOnly: true,
          minTapTarget: Number(customMinTap),
        });
      } else if (customViewingDistance === "far") {
        return defineSurface({
          name: customName,
          width: Number(customWidth),
          height: Number(customHeight),
          safeArea: {
            top: Number(customSafeTop),
            right: Number(customSafeRight),
            bottom: Number(customSafeBottom),
            left: Number(customSafeLeft),
          },
          viewingDistance: "far",
          minTextSize: Number(customMinTextSize),
        });
      } else {
        return defineSurface({
          name: customName,
          width: Number(customWidth),
          height: Number(customHeight),
          safeArea: {
            top: Number(customSafeTop),
            right: Number(customSafeRight),
            bottom: Number(customSafeBottom),
            left: Number(customSafeLeft),
          },
        });
      }
    } catch {
      return null;
    }
  }, [
    selectedPresetId,
    customName,
    customWidth,
    customHeight,
    customSafeTop,
    customSafeRight,
    customSafeBottom,
    customSafeLeft,
    customTouchOnly,
    customMinTap,
    customViewingDistance,
    customMinTextSize,
  ]);

  // Live constraint resolution
  const resolutionResult = useMemo<{ layout: ResolvedLayout | null; error: string | null }>(() => {
    if (!activeSurface) {
      return { layout: null, error: "Invalid surface configuration." };
    }
    try {
      const layout = resolveLayout(demoAdSpec, activeSurface, domTextMeasurer);
      return { layout, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { layout: null, error: message };
    }
  }, [activeSurface]);

  const { layout, error } = resolutionResult;

  // Mount to DOM or Canvas depending on selected renderer mode
  useEffect(() => {
    if (!layout || !activeSurface || error) return;

    if (rendererType === "dom" && containerRef.current) {
      renderToDOM(layout, demoAdSpec, activeSurface, containerRef.current, { showSafeAreas });
    } else if (rendererType === "canvas" && canvasRef.current) {
      renderLayoutToCanvasElement(canvasRef.current, layout, demoAdSpec, activeSurface, {
        showSafeAreas,
        onImageLoaded: () => {
          if (canvasRef.current && layout && activeSurface) {
            renderLayoutToCanvasElement(canvasRef.current, layout, demoAdSpec, activeSurface, {
              showSafeAreas,
            });
          }
        },
      });
    }
  }, [layout, activeSurface, showSafeAreas, error, rendererType]);

  // Derived axis & metrics
  const axis = activeSurface ? deriveAxis(activeSurface) : null;
  const aspectRatio = activeSurface ? (activeSurface.width / activeSurface.height).toFixed(2) : "0";

  // Fit scale calculation for viewport preview
  const maxPreviewW = 820;
  const maxPreviewH = 480;
  const scale = activeSurface
    ? Math.min(maxPreviewW / activeSurface.width, maxPreviewH / activeSurface.height, 1)
    : 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 font-black text-white text-lg ring-1 ring-white/20">
            ✦
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-white">
                Adaptive Layout Engine
              </h1>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Multi-surface constraint resolution system without per-surface branching
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Renderer Selector Segmented Control (Bonus 2) */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setRendererType("dom")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                rendererType === "dom"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🌐</span>
              <span>DOM Renderer</span>
            </button>
            <button
              type="button"
              onClick={() => setRendererType("canvas")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                rendererType === "canvas"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🎨</span>
              <span>Canvas Renderer (Bonus)</span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer bg-slate-800/80 hover:bg-slate-800 px-3.5 py-2 rounded-lg border border-slate-700 transition-colors select-none shadow-sm">
            <input
              type="checkbox"
              checked={showSafeAreas}
              onChange={(e) => setShowSafeAreas(e.target.checked)}
              className="accent-emerald-500 rounded w-4 h-4 cursor-pointer"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              Show Safe Areas
            </span>
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Surface Picker & Controllers (4 cols) */}
        <section className="lg:col-span-4 flex flex-col gap-5">
          {/* Surface Presets */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Target Surfaces
              </h2>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {PRESET_SURFACES.length} Surfaces
              </span>
            </div>

            <div className="space-y-2">
              {PRESET_SURFACES.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-150 flex items-start gap-3.5 cursor-pointer select-none ${
                      isSelected
                        ? "bg-gradient-to-r from-indigo-950/80 to-slate-900 border-indigo-500/80 text-white shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-500/40"
                        : "bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/60 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-2xl p-2 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                      {preset.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold truncate text-slate-100">
                          {preset.label}
                        </span>
                        {preset.id === "kiosk-tight" && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                            Degrade
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">{preset.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Surface Editor */}
          {selectedPresetId === "custom" && (
            <div className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-4 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <span>Custom Surface Parameters</span>
                </h3>
                <span className="text-[10px] text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Live Resolver
                </span>
              </div>

              {/* Unseen Surface Rehearsal Quick Presets */}
              <div className="space-y-1.5 pb-2 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Unseen Geometry Presets:
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomName("In-Car Panoramic HUD");
                      setCustomWidth(2560);
                      setCustomHeight(720);
                      setCustomSafeTop(24);
                      setCustomSafeRight(60);
                      setCustomSafeBottom(24);
                      setCustomSafeLeft(60);
                      setCustomTouchOnly(true);
                      setCustomMinTap(56);
                      setCustomViewingDistance("near");
                    }}
                    className="text-[11px] text-left px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-slate-300 transition-colors truncate cursor-pointer font-medium"
                    title="2560x720 • Touch (56px) • Horizontal-Band"
                  >
                    🚗 In-Car HUD (2560×720)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomName("Smart Fridge Door");
                      setCustomWidth(1080);
                      setCustomHeight(1920);
                      setCustomSafeTop(160);
                      setCustomSafeRight(40);
                      setCustomSafeBottom(220);
                      setCustomSafeLeft(40);
                      setCustomTouchOnly(true);
                      setCustomMinTap(48);
                      setCustomViewingDistance("near");
                    }}
                    className="text-[11px] text-left px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-slate-300 transition-colors truncate cursor-pointer font-medium"
                    title="1080x1920 • Touch (48px) • Vertical Stack"
                  >
                    🧊 Smart Fridge (1080×1920)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomName("Stadium Jumbotron");
                      setCustomWidth(3840);
                      setCustomHeight(1080);
                      setCustomSafeTop(48);
                      setCustomSafeRight(96);
                      setCustomSafeBottom(48);
                      setCustomSafeLeft(96);
                      setCustomTouchOnly(false);
                      setCustomViewingDistance("far");
                      setCustomMinTextSize(36);
                    }}
                    className="text-[11px] text-left px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-slate-300 transition-colors truncate cursor-pointer font-medium"
                    title="3840x1080 • Far View (36px) • Horizontal-Band"
                  >
                    🏟️ Jumbotron (3840×1080)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomName("Wearable Micro HUD");
                      setCustomWidth(280);
                      setCustomHeight(280);
                      setCustomSafeTop(12);
                      setCustomSafeRight(12);
                      setCustomSafeBottom(12);
                      setCustomSafeLeft(12);
                      setCustomTouchOnly(true);
                      setCustomMinTap(40);
                      setCustomViewingDistance("near");
                    }}
                    className="text-[11px] text-left px-2 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg text-slate-300 transition-colors truncate cursor-pointer font-medium"
                    title="280x280 • Touch (40px) • Degradation Test"
                  >
                    ⌚ Micro HUD (280×280)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">Surface Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value || "Custom Surface")}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Width (px)</label>
                  <input
                    type="number"
                    min="100"
                    max="4000"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Height (px)</label>
                  <input
                    type="number"
                    min="80"
                    max="4000"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Safe Area Insets [T, R, B, L] (px)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    placeholder="Top"
                    value={customSafeTop}
                    onChange={(e) => setCustomSafeTop(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-center text-white"
                  />
                  <input
                    type="number"
                    placeholder="Right"
                    value={customSafeRight}
                    onChange={(e) => setCustomSafeRight(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-center text-white"
                  />
                  <input
                    type="number"
                    placeholder="Bottom"
                    value={customSafeBottom}
                    onChange={(e) => setCustomSafeBottom(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-center text-white"
                  />
                  <input
                    type="number"
                    placeholder="Left"
                    value={customSafeLeft}
                    onChange={(e) => setCustomSafeLeft(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-center text-white"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2.5 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={customTouchOnly}
                      onChange={(e) => setCustomTouchOnly(e.target.checked)}
                      className="accent-indigo-500 rounded w-4 h-4"
                    />
                    <span>Touch Device</span>
                  </label>
                  {customTouchOnly && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Min Tap:</span>
                      <input
                        type="number"
                        min="20"
                        max="80"
                        value={customMinTap}
                        onChange={(e) => setCustomMinTap(parseInt(e.target.value) || 44)}
                        className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300">Viewing Distance:</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={customViewingDistance}
                      onChange={(e) => setCustomViewingDistance(e.target.value as "near" | "far")}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="near">Near (Mobile/Kiosk)</option>
                      <option value="far">Far (Billboard/TV)</option>
                    </select>
                    {customViewingDistance === "far" && (
                      <input
                        type="number"
                        min="16"
                        max="64"
                        value={customMinTextSize}
                        onChange={(e) => setCustomMinTextSize(parseInt(e.target.value) || 24)}
                        className="w-14 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white"
                        title="Min Text Size (px)"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ad Spec Manifest */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-1">
              Active Declarative Ad Spec
            </h3>
            <div className="space-y-1.5 font-mono text-xs">
              {demoAdSpec.elements.map((el) => (
                <div
                  key={el.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      P{el.priority}
                    </span>
                    <span className="truncate text-slate-200 font-semibold">{el.id}</span>
                  </div>
                  <span className="text-[11px] text-indigo-400 lowercase font-medium bg-indigo-500/10 px-2 py-0.5 rounded">
                    {el.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Live Viewport Canvas & Output Inspector (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-5">
          {/* Surface Meta Badge Bar */}
          {activeSurface && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3.5 text-xs shadow-lg">
              <div className="flex items-center gap-3">
                <span className="font-bold text-white text-sm">{activeSurface.name}</span>
                <span className="font-mono text-slate-300 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800 text-xs font-semibold">
                  {activeSurface.width} × {activeSurface.height}px
                </span>
                <span className="font-mono text-slate-400 font-medium">
                  Aspect: {aspectRatio}:1
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400">Axis:</span>
                <span className="font-mono font-bold px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wider text-xs">
                  {axis}
                </span>

                {activeSurface.touchOnly && (
                  <span className="font-mono px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                    Touch (≥{activeSurface.minTapTarget ?? 44}px)
                  </span>
                )}

                {activeSurface.viewingDistance === "far" && (
                  <span className="font-mono px-2.5 py-1 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-xs font-semibold">
                    Far View (≥{activeSurface.minTextSize ?? 24}px)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Canvas Render Screen Box */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden ring-1 ring-white/5">
            {error ? (
              <div className="p-8 max-w-lg bg-rose-950/40 border border-rose-500/50 rounded-2xl text-center shadow-xl">
                <div className="text-rose-400 text-3xl mb-3">⚠️</div>
                <h3 className="text-base font-bold text-rose-300 mb-2">Layout Resolution Refused</h3>
                <p className="text-xs text-rose-300/90 font-mono break-words leading-relaxed">{error}</p>
                <p className="text-xs text-slate-400 mt-4 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  The constraint resolver guarantees zero silent overlaps or clipping violations.
                </p>
              </div>
            ) : layout && activeSurface ? (
              <div
                className="relative shadow-2xl border border-slate-700/80 rounded-xl overflow-hidden transition-all duration-300 ring-2 ring-indigo-500/20"
                style={{
                  width: `${activeSurface.width * scale}px`,
                  height: `${activeSurface.height * scale}px`,
                }}
              >
                {rendererType === "dom" ? (
                  <div
                    ref={containerRef}
                    style={{
                      width: `${activeSurface.width}px`,
                      height: `${activeSurface.height}px`,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                  />
                ) : (
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: `${activeSurface.width}px`,
                      height: `${activeSurface.height}px`,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      display: "block",
                    }}
                  />
                )}
              </div>
            ) : null}

            {activeSurface && scale < 1 && !error && (
              <div className="absolute bottom-3 right-4 text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
                Preview Zoom: {Math.round(scale * 100)}% (Actual: {activeSurface.width}×{activeSurface.height}px)
              </div>
            )}
          </div>

          {/* Degradation & Coordinate Inspector Table */}
          {layout && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3.5 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Layout Output Inspector
                </h3>
                <span className="text-xs font-mono font-medium text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                  {layout.filter((e) => e.visible).length} visible • {layout.filter((e) => !e.visible).length} dropped
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {layout.map((el) => {
                  const specEl = demoAdSpec.elements.find((e) => e.id === el.id);
                  const isDropped = !el.visible || el.degraded === "dropped";
                  const isShrunk = el.degraded === "shrunk";
                  const isRepositioned = el.degraded === "repositioned";

                  return (
                    <div
                      key={el.id}
                      className={`p-3 rounded-xl border text-xs flex flex-col justify-between transition-all ${
                        isDropped
                          ? "bg-slate-950/40 border-slate-800/50 opacity-60"
                          : "bg-slate-950 border-slate-800 text-slate-200 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-100 truncate text-sm">{el.id}</span>
                        {isDropped ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            DROPPED
                          </span>
                        ) : isShrunk ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            SHRUNK
                          </span>
                        ) : isRepositioned ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                            COMPACT
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            NORMAL
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between font-mono text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                        <span>P{specEl?.priority ?? "?"} • {specEl?.role}</span>
                        {el.visible ? (
                          <span className="text-indigo-300 font-semibold">
                            {el.width}×{el.height} @ ({el.x},{el.y})
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">omitted</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
