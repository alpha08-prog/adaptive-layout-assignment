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

// Canonical Demo Ad Spec
export const demoAdSpec: AdSpec = defineAd({
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
export const mobilePortrait = defineSurface({
  name: "Mobile Portrait",
  width: 390,
  height: 844,
  safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
  touchOnly: true,
  minTapTarget: 48,
});

export const mobileLandscape = defineSurface({
  name: "Mobile Landscape",
  width: 844,
  height: 390,
  safeArea: { top: 0, right: 47, bottom: 21, left: 47 },
  touchOnly: true,
  minTapTarget: 48,
});

export const broadcastLowerThird = defineSurface({
  name: "Broadcast Lower-Third",
  width: 1920,
  height: 360,
  safeArea: { top: 24, right: 64, bottom: 24, left: 64 },
  viewingDistance: "far",
  minTextSize: 24,
});

export const squareKiosk = defineSurface({
  name: "Square Kiosk",
  width: 800,
  height: 800,
  safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
  touchOnly: true,
  minTapTarget: 48,
});

export const squareKioskTight = defineSurface({
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

  const containerRef = useRef<HTMLDivElement>(null);

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

  // Mount to DOM via render-dom.ts
  useEffect(() => {
    if (containerRef.current && layout && activeSurface && !error) {
      renderToDOM(layout, demoAdSpec, activeSurface, containerRef.current, { showSafeAreas });
    }
  }, [layout, activeSurface, showSafeAreas, error]);

  // Derived axis & metrics
  const axis = activeSurface ? deriveAxis(activeSurface) : null;
  const aspectRatio = activeSurface ? (activeSurface.width / activeSurface.height).toFixed(2) : "0";

  // Fit scale calculation for viewport preview
  const maxPreviewW = 780;
  const maxPreviewH = 460;
  const scale = activeSurface
    ? Math.min(maxPreviewW / activeSurface.width, maxPreviewH / activeSurface.height, 1)
    : 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Header Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-black text-white text-base">
            ✦
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Adaptive Layout Engine
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v1.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Single declarative ad spec adapted across multi-surface profiles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer bg-slate-800/60 hover:bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700/60 transition-colors select-none">
            <input
              type="checkbox"
              checked={showSafeAreas}
              onChange={(e) => setShowSafeAreas(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            <span>Show Safe Areas</span>
          </label>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Surface Picker & Custom Controller (4 cols) */}
        <section className="lg:col-span-4 flex flex-col gap-5">
          {/* Surface Presets */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span>Target Surfaces</span>
            </h2>

            <div className="space-y-2">
              {PRESET_SURFACES.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all duration-150 flex items-start gap-3 cursor-pointer select-none ${
                      isSelected
                        ? "bg-indigo-600/15 border-indigo-500/60 text-white shadow-md shadow-indigo-500/10"
                        : "bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-xl p-1 rounded bg-slate-800/60 border border-slate-700/40">
                      {preset.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate">{preset.label}</span>
                        {preset.id === "kiosk-tight" && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">
                            Degrade
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{preset.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Surface Editor (Visible when Custom is selected) */}
          {selectedPresetId === "custom" && (
            <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 shadow-xl space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <span>Custom Surface Parameters</span>
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">Live Resolver</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 block">Surface Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value || "Custom Surface")}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Width (px)</label>
                  <input
                    type="number"
                    min="100"
                    max="4000"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Height (px)</label>
                  <input
                    type="number"
                    min="80"
                    max="4000"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Safe Area Insets [T, R, B, L] (px)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    placeholder="Top"
                    value={customSafeTop}
                    onChange={(e) => setCustomSafeTop(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center text-white"
                  />
                  <input
                    type="number"
                    placeholder="Right"
                    value={customSafeRight}
                    onChange={(e) => setCustomSafeRight(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center text-white"
                  />
                  <input
                    type="number"
                    placeholder="Bottom"
                    value={customSafeBottom}
                    onChange={(e) => setCustomSafeBottom(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center text-white"
                  />
                  <input
                    type="number"
                    placeholder="Left"
                    value={customSafeLeft}
                    onChange={(e) => setCustomSafeLeft(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-center text-white"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customTouchOnly}
                      onChange={(e) => setCustomTouchOnly(e.target.checked)}
                      className="accent-indigo-500 rounded"
                    />
                    <span>Touch Only Device</span>
                  </label>
                  {customTouchOnly && (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-400">Min Tap:</span>
                      <input
                        type="number"
                        min="20"
                        max="80"
                        value={customMinTap}
                        onChange={(e) => setCustomMinTap(parseInt(e.target.value) || 44)}
                        className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-center text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 flex items-center gap-2">
                    <span>Viewing Distance:</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={customViewingDistance}
                      onChange={(e) => setCustomViewingDistance(e.target.value as "near" | "far")}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="near">Near (Mobile/Kiosk)</option>
                      <option value="far">Far (Billboard/Broadcast)</option>
                    </select>
                    {customViewingDistance === "far" && (
                      <input
                        type="number"
                        min="16"
                        max="64"
                        value={customMinTextSize}
                        onChange={(e) => setCustomMinTextSize(parseInt(e.target.value) || 24)}
                        className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs text-center text-white"
                        title="Min Text Size (px)"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ad Spec Manifest */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Active Declarative Ad Spec
            </h3>
            <div className="space-y-1.5 font-mono text-xs">
              {demoAdSpec.elements.map((el) => (
                <div
                  key={el.id}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-950/60 border border-slate-800/60 text-slate-300"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      P{el.priority}
                    </span>
                    <span className="truncate">{el.id}</span>
                  </div>
                  <span className="text-[11px] text-indigo-400/90 lowercase">{el.role}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Live Viewport Canvas & Status Inspector (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-5">
          {/* Surface Meta Badge Bar */}
          {activeSurface && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-white text-sm">{activeSurface.name}</span>
                <span className="font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {activeSurface.width} × {activeSurface.height}px
                </span>
                <span className="font-mono text-slate-400">Ratio: {aspectRatio}:1</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">Axis:</span>
                <span className="font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider text-[11px]">
                  {axis}
                </span>

                {activeSurface.touchOnly && (
                  <span className="font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px]">
                    Touch (≥{activeSurface.minTapTarget ?? 44}px)
                  </span>
                )}

                {activeSurface.viewingDistance === "far" && (
                  <span className="font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px]">
                    Far View (≥{activeSurface.minTextSize ?? 24}px)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Canvas Render Screen Box */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6 shadow-2xl flex flex-col items-center justify-center min-h-[480px] relative overflow-hidden">
            {error ? (
              <div className="p-6 max-w-md bg-rose-950/40 border border-rose-500/40 rounded-xl text-center">
                <div className="text-rose-400 text-2xl mb-2">⚠️</div>
                <h3 className="text-sm font-bold text-rose-300 mb-1">Layout Resolution Error</h3>
                <p className="text-xs text-rose-400/90 font-mono break-words">{error}</p>
                <p className="text-[11px] text-slate-400 mt-3">
                  The constraint engine refused to silently overlap or clip elements.
                </p>
              </div>
            ) : layout && activeSurface ? (
              <div
                className="relative shadow-2xl border border-slate-700/60 rounded-lg overflow-hidden transition-all duration-300"
                style={{
                  width: `${activeSurface.width * scale}px`,
                  height: `${activeSurface.height * scale}px`,
                }}
              >
                <div
                  ref={containerRef}
                  style={{
                    width: `${activeSurface.width}px`,
                    height: `${activeSurface.height}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
            ) : null}

            {activeSurface && scale < 1 && !error && (
              <div className="absolute bottom-2 right-3 text-[10px] font-mono text-slate-500">
                Scaled view: {Math.round(scale * 100)}% (actual: {activeSurface.width}×{activeSurface.height}px)
              </div>
            )}
          </div>

          {/* Degradation & Coordinate Inspector Table */}
          {layout && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                <span>Layout Output Inspector</span>
                <span className="text-[11px] font-mono font-normal text-slate-400">
                  {layout.filter((e) => e.visible).length} visible • {layout.filter((e) => !e.visible).length} dropped
                </span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {layout.map((el) => {
                  const specEl = demoAdSpec.elements.find((e) => e.id === el.id);
                  const isDropped = !el.visible || el.degraded === "dropped";
                  const isShrunk = el.degraded === "shrunk";
                  const isRepositioned = el.degraded === "repositioned";

                  return (
                    <div
                      key={el.id}
                      className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between transition-colors ${
                        isDropped
                          ? "bg-slate-950/40 border-slate-800/60 opacity-60"
                          : "bg-slate-950/80 border-slate-800 text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-slate-200 truncate">{el.id}</span>
                        {isDropped ? (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            DROPPED
                          </span>
                        ) : isShrunk ? (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            SHRUNK
                          </span>
                        ) : isRepositioned ? (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            COMPACT
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            NORMAL
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                        <span>P{specEl?.priority ?? "?"} • {specEl?.role}</span>
                        {el.visible ? (
                          <span className="text-slate-300">
                            {el.width}×{el.height} @ ({el.x},{el.y})
                          </span>
                        ) : (
                          <span className="text-slate-500">hidden</span>
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
