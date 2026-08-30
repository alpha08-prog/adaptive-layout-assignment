import { useState, useEffect, useRef, useMemo } from "react";
import { defineAd } from "./spec.ts";
import {
  defineSurface,
  type SurfaceProfile,
} from "./surfaces.ts";
import {
  resolveLayout,
  deriveAxis,
  domTextMeasurer,
  type ResolvedLayout,
} from "./resolver.ts";
import { renderToDOM } from "./render-dom.ts";
import { renderLayoutToCanvasElement } from "./render-canvas.ts";

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
  safeArea: { top: 20, right: 40, bottom: 20, left: 40 },
  viewingDistance: "far",
  minTextSize: 24,
});

const squareKiosk = defineSurface({
  name: "Square Kiosk",
  width: 800,
  height: 800,
  safeArea: { top: 16, right: 16, bottom: 16, left: 16 },
  touchOnly: true,
  minTapTarget: 48,
});

/**
 * Standard Declarative Ad Specification used across all tests & UI.
 */
const demoAdSpec = defineAd({
  elements: [
    {
      id: "hero-image",
      type: "image",
      role: "hero",
      priority: 2,
      content:
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
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
      type: "text",
      role: "branding",
      priority: 3,
      content: "AURA AUDIO",
    },
  ],
});

const squareKioskCompact = defineSurface({
  name: "Square Kiosk (Compact)",
  width: 360,
  height: 240,
  safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
  touchOnly: true,
  minTapTarget: 44,
});

const squareKioskTight = defineSurface({
  name: "Square Kiosk (Tight)",
  width: 320,
  height: 170,
  safeArea: { top: 10, right: 10, bottom: 10, left: 10 },
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
    id: "custom",
    label: "Custom Surface",
    icon: "⚙️",
    surface: squareKiosk,
    desc: "Live Arbitrary Geometry & Constraints",
  },
];

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("mobile-portrait");
  const [kioskMode, setKioskMode] = useState<"standard" | "compact" | "tight">("standard");
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
    if (selectedPresetId === "square-kiosk") {
      if (kioskMode === "compact") return squareKioskCompact;
      if (kioskMode === "tight") return squareKioskTight;
      return squareKiosk;
    }

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
    kioskMode,
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
  const maxPreviewH = 440;
  const scale = activeSurface
    ? Math.min(maxPreviewW / activeSurface.width, maxPreviewH / activeSurface.height, 1)
    : 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-zinc-200 text-xs">
            AL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
                Adaptive Layout Engine
              </h1>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                v1.0
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Constraint-based declarative ad layout resolution across arbitrary surfaces
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Renderer Selector Segmented Control */}
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setRendererType("dom")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                rendererType === "dom"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              DOM Renderer
            </button>
            <button
              type="button"
              onClick={() => setRendererType("canvas")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                rendererType === "canvas"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Canvas 2D
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer bg-zinc-900 hover:bg-zinc-800/80 px-3 py-1.5 rounded-lg border border-zinc-800 transition-colors select-none">
            <input
              type="checkbox"
              checked={showSafeAreas}
              onChange={(e) => setShowSafeAreas(e.target.checked)}
              className="accent-emerald-500 rounded w-3.5 h-3.5 cursor-pointer"
            />
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              Safe Area Insets
            </span>
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Surface Picker & Controllers (4 cols) */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          {/* Surface Presets */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 px-0.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Target Surfaces
              </h2>
              <span className="text-[11px] font-mono text-zinc-500">
                {PRESET_SURFACES.length} Presets
              </span>
            </div>

            <div className="space-y-2">
              {PRESET_SURFACES.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                const isKiosk = preset.id === "square-kiosk";

                let descText = preset.desc;
                if (isKiosk) {
                  if (kioskMode === "compact") descText = "360 × 240 • Intermediate Shrink (Branding Shrunk)";
                  else if (kioskMode === "tight") descText = "320 × 170 • Forced Degradation (Drops Branding)";
                  else descText = "800 × 800 • Touch (48px) • 2D Split Grid";
                }

                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-2.5 cursor-pointer select-none ${
                      isSelected
                        ? "bg-zinc-900 border-zinc-600 text-white shadow-sm"
                        : "bg-zinc-950/40 border-zinc-800/80 hover:bg-zinc-900/30 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <span className="text-xl p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0">
                        {preset.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold truncate text-zinc-100">
                            {preset.label}
                          </span>
                          {isKiosk && kioskMode === "compact" && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono font-medium">
                              Shrunk
                            </span>
                          )}
                          {isKiosk && kioskMode === "tight" && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-medium">
                              Dropped
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5 truncate">{descText}</p>
                      </div>
                    </div>

                    {/* Square Kiosk interactive mode pills */}
                    {isKiosk && (
                      <div
                        className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPresetId("square-kiosk");
                            setKioskMode("standard");
                          }}
                          className={`flex-1 text-[11px] py-1 px-1 rounded-md font-mono font-medium transition-all text-center cursor-pointer ${
                            selectedPresetId === "square-kiosk" && kioskMode === "standard"
                              ? "bg-zinc-800 text-white shadow-sm border border-zinc-600 font-semibold"
                              : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                          }`}
                        >
                          800×800 (Full)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPresetId("square-kiosk");
                            setKioskMode("compact");
                          }}
                          className={`flex-1 text-[11px] py-1 px-1 rounded-md font-mono font-medium transition-all text-center cursor-pointer ${
                            selectedPresetId === "square-kiosk" && kioskMode === "compact"
                              ? "bg-blue-950/80 text-blue-300 shadow-sm border border-blue-600 font-semibold"
                              : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                          }`}
                        >
                          360×240 (Shrink)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPresetId("square-kiosk");
                            setKioskMode("tight");
                          }}
                          className={`flex-1 text-[11px] py-1 px-1 rounded-md font-mono font-medium transition-all text-center cursor-pointer ${
                            selectedPresetId === "square-kiosk" && kioskMode === "tight"
                              ? "bg-amber-950/80 text-amber-300 shadow-sm border border-amber-600 font-semibold"
                              : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                          }`}
                        >
                          320×170 (Drop)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Surface Editor */}
          {selectedPresetId === "custom" && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Custom Surface Geometry
                </h3>
                <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  Live Resolver
                </span>
              </div>

              {/* Unseen Surface Rehearsal Quick Presets */}
              <div className="space-y-1.5 pb-2 border-b border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-400 block">
                  Quick Benchmark Presets:
                </span>
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
                    className="text-[11px] text-left px-2 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-300 transition-colors truncate cursor-pointer font-medium"
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
                    className="text-[11px] text-left px-2 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-300 transition-colors truncate cursor-pointer font-medium"
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
                    className="text-[11px] text-left px-2 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-300 transition-colors truncate cursor-pointer font-medium"
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
                    className="text-[11px] text-left px-2 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-300 transition-colors truncate cursor-pointer font-medium"
                    title="280x280 • Touch (40px) • Degradation Test"
                  >
                    ⌚ Micro HUD (280×280)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300 block">Surface Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value || "Custom Surface")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-300">Width</label>
                    <span className="text-[10px] font-mono text-zinc-400">{customWidth}px</span>
                  </div>
                  <input
                    type="number"
                    min="100"
                    max="4000"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600 mb-1.5 font-mono"
                  />
                  <input
                    type="range"
                    min="200"
                    max="3840"
                    step="10"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value))}
                    className="w-full accent-zinc-400 cursor-pointer h-1 bg-zinc-800 rounded-lg"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-300">Height</label>
                    <span className="text-[10px] font-mono text-zinc-400">{customHeight}px</span>
                  </div>
                  <input
                    type="number"
                    min="80"
                    max="4000"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600 mb-1.5 font-mono"
                  />
                  <input
                    type="range"
                    min="120"
                    max="2160"
                    step="10"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(parseInt(e.target.value))}
                    className="w-full accent-zinc-400 cursor-pointer h-1 bg-zinc-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Safe Area Insets [Top, Right, Bottom, Left] (px)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    placeholder="Top"
                    value={customSafeTop}
                    onChange={(e) => setCustomSafeTop(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-center text-white font-mono focus:border-zinc-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Right"
                    value={customSafeRight}
                    onChange={(e) => setCustomSafeRight(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-center text-white font-mono focus:border-zinc-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Bottom"
                    value={customSafeBottom}
                    onChange={(e) => setCustomSafeBottom(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-center text-white font-mono focus:border-zinc-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Left"
                    value={customSafeLeft}
                    onChange={(e) => setCustomSafeLeft(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-center text-white font-mono focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2.5 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-300 flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={customTouchOnly}
                      onChange={(e) => setCustomTouchOnly(e.target.checked)}
                      className="accent-zinc-400 rounded w-3.5 h-3.5"
                    />
                    <span>Touch Device</span>
                  </label>
                  {customTouchOnly && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400 font-mono">Min Tap:</span>
                      <input
                        type="number"
                        min="20"
                        max="80"
                        value={customMinTap}
                        onChange={(e) => setCustomMinTap(parseInt(e.target.value) || 44)}
                        className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-center text-white font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-300">Viewing Distance:</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={customViewingDistance}
                      onChange={(e) => setCustomViewingDistance(e.target.value as "near" | "far")}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
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
                        className="w-14 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-center text-white font-mono"
                        title="Min Text Size (px)"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ad Spec Manifest */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5 px-0.5">
              Active Declarative Ad Spec
            </h3>
            <div className="space-y-1.5 font-mono text-xs">
              {demoAdSpec.elements.map((el) => (
                <div
                  key={el.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-zinc-300"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      P{el.priority}
                    </span>
                    <span className="truncate text-zinc-200 font-medium">{el.id}</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono lowercase bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {el.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Live Viewport Canvas & Output Inspector (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-4 lg:sticky lg:top-6 self-start">
          {/* Surface Meta Badge Bar */}
          {activeSurface && (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-white text-sm">{activeSurface.name}</span>
                <span className="font-mono text-zinc-300 bg-zinc-950 px-2.5 py-0.5 rounded border border-zinc-800 text-xs">
                  {activeSurface.width} × {activeSurface.height}px
                </span>
                <span className="font-mono text-zinc-400 text-xs">
                  Ratio: {aspectRatio}:1
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-400 text-xs">Axis:</span>
                <span className="font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs uppercase tracking-wider">
                  {axis}
                </span>

                {activeSurface.touchOnly && (
                  <span className="font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/60 text-xs font-medium">
                    Touch (≥{activeSurface.minTapTarget ?? 44}px)
                  </span>
                )}

                {activeSurface.viewingDistance === "far" && (
                  <span className="font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-400 border border-purple-800/60 text-xs font-medium">
                    Far View (≥{activeSurface.minTextSize ?? 24}px)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Canvas Render Screen Box */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center min-h-[420px] relative overflow-hidden">
            {error ? (
              <div className="p-6 max-w-lg bg-rose-950/30 border border-rose-800/60 rounded-xl text-center">
                <div className="text-rose-400 text-2xl mb-2">⚠️</div>
                <h3 className="text-sm font-semibold text-rose-300 mb-1">Layout Resolution Refused</h3>
                <p className="text-xs text-rose-300/90 font-mono break-words leading-relaxed">{error}</p>
                <p className="text-xs text-zinc-400 mt-3 bg-zinc-950/60 p-2 rounded border border-zinc-800">
                  The constraint resolver guarantees zero silent overlaps or clipping violations.
                </p>
              </div>
            ) : layout && activeSurface ? (
              <div
                className="relative border border-zinc-800 rounded-xl overflow-hidden transition-all duration-200"
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
              <div className="absolute bottom-2.5 right-3 text-[10px] font-mono text-zinc-500 bg-zinc-950/90 px-2 py-0.5 rounded border border-zinc-800">
                Fit: {Math.round(scale * 100)}% ({activeSurface.width}×{activeSurface.height}px)
              </div>
            )}
          </div>

          {/* Degradation & Coordinate Inspector Table */}
          {layout && (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 px-0.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Layout Output Inspector
                </h3>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {layout.filter((e) => e.visible).length} visible • {layout.filter((e) => !e.visible).length} dropped
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {layout.map((el) => {
                  const specEl = demoAdSpec.elements.find((e) => e.id === el.id);
                  const isDropped = !el.visible || el.degraded === "dropped";
                  const isShrunk = el.degraded === "shrunk";
                  const isRepositioned = el.degraded === "repositioned";

                  return (
                    <div
                      key={el.id}
                      className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between transition-all ${
                        isDropped
                          ? "bg-zinc-950/30 border-zinc-900 opacity-50"
                          : "bg-zinc-950/70 border-zinc-800/90 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-zinc-100 truncate text-xs">{el.id}</span>
                        {isDropped ? (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-800/50">
                            DROPPED
                          </span>
                        ) : isShrunk ? (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/50">
                            SHRUNK
                          </span>
                        ) : isRepositioned ? (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-800/50">
                            COMPACT
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/50">
                            NORMAL
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between font-mono text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                        <span>P{specEl?.priority ?? "?"} • {specEl?.role}</span>
                        {el.visible ? (
                          <span className="text-zinc-300 font-medium">
                            {el.width}×{el.height} @ ({el.x},{el.y})
                          </span>
                        ) : (
                          <span className="text-zinc-600 italic">omitted</span>
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
