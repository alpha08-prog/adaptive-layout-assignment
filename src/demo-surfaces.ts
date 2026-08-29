// demo-surfaces.ts — The 4+ required surface profiles using defineSurface()
import { defineSurface, type SurfaceProfile } from "./surfaces.ts";

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

export const demoSurfaces: SurfaceProfile[] = [
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  squareKiosk,
  squareKioskTight,
];
