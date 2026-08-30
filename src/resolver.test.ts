// resolver.test.ts — Vitest suite for the constraint resolution engine
import { describe, it, expect } from "vitest";
import { defineAd, type AdSpec } from "./spec.ts";
import { defineSurface } from "./surfaces.ts";
import {
  resolveLayout,
  deriveAxis,
  hardConstraintFloor,
  assertNoOverlapOrClip,
  LayoutError,
  mockTextMeasurer,
} from "./resolver.ts";
import { renderToCanvas } from "./render-canvas.ts";

const testAdSpec: AdSpec = defineAd({
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

describe("Phase 1: Type System & Runtime Validators", () => {
  describe("defineAd", () => {
    it("accepts a valid AdSpec", () => {
      const validSpec: AdSpec = {
        elements: [
          { id: "hero-img", type: "image", role: "hero", priority: 1 },
          { id: "headline-txt", type: "text", role: "primary", priority: 1, content: "Summer Sale" },
          { id: "cta-btn", type: "button", role: "action", priority: 2, content: "Shop Now" },
        ],
      };

      const result = defineAd(validSpec);
      expect(result).toBe(validSpec);
      expect(result.elements).toHaveLength(3);
    });

    it("throws a descriptive error on empty elements array", () => {
      expect(() => defineAd({ elements: [] })).toThrow(/spec must contain at least one element/i);
    });

    it("throws a descriptive error on duplicate element IDs", () => {
      const invalidSpec: AdSpec = {
        elements: [
          { id: "duplicate-id", type: "text", role: "primary", priority: 1 },
          { id: "duplicate-id", type: "button", role: "action", priority: 2 },
        ],
      };

      expect(() => defineAd(invalidSpec)).toThrow(
        /Duplicate element ID found: "duplicate-id"/i
      );
    });

    it("throws on invalid element role, type, or priority", () => {
      // @ts-expect-error - invalid type testing runtime guard
      expect(() => defineAd({ elements: [{ id: "el1", type: "video", role: "hero", priority: 1 }] })).toThrow(
        /unknown type "video"/i
      );

      // @ts-expect-error - invalid role testing runtime guard
      expect(() => defineAd({ elements: [{ id: "el2", type: "text", role: "footer", priority: 1 }] })).toThrow(
        /unknown role "footer"/i
      );

      // @ts-expect-error - invalid priority testing runtime guard
      expect(() => defineAd({ elements: [{ id: "el3", type: "text", role: "primary", priority: 4 }] })).toThrow(
        /priority must be 1, 2, or 3/i
      );
    });
  });

  describe("defineSurface", () => {
    it("accepts a valid SurfaceProfile without safeArea or special constraints", () => {
      const surface = defineSurface({
        name: "desktop-banner",
        width: 1200,
        height: 400,
      });

      expect(surface.name).toBe("desktop-banner");
      expect(surface.width).toBe(1200);
      expect(surface.height).toBe(400);
    });

    it("accepts valid touchOnly surface with minTapTarget", () => {
      const surface = defineSurface({
        name: "mobile-portrait",
        width: 390,
        height: 844,
        touchOnly: true,
        minTapTarget: 48,
      });

      expect(surface.touchOnly).toBe(true);
      expect(surface.minTapTarget).toBe(48);
    });

    it("accepts valid viewingDistance far surface with minTextSize", () => {
      const billboard = defineSurface({
        name: "billboard-far",
        width: 1920,
        height: 1080,
        viewingDistance: "far",
        minTextSize: 32,
      });

      expect(billboard.viewingDistance).toBe("far");
      expect(billboard.minTextSize).toBe(32);
    });

    it("throws on non-positive width or height", () => {
      expect(() =>
        defineSurface({
          name: "zero-width",
          width: 0,
          height: 500,
        })
      ).toThrow(/'width' must be a positive number/i);

      expect(() =>
        defineSurface({
          name: "negative-height",
          width: 500,
          height: -100,
        })
      ).toThrow(/'height' must be a positive number/i);
    });

    it("throws when safeArea insets exceed or equal surface dimensions", () => {
      expect(() =>
        defineSurface({
          name: "bad-safe-area-x",
          width: 300,
          height: 600,
          safeArea: { top: 10, right: 160, bottom: 10, left: 150 },
        })
      ).toThrow(/safeArea horizontal insets .* cannot exceed or equal width/i);

      expect(() =>
        defineSurface({
          name: "bad-safe-area-y",
          width: 300,
          height: 600,
          safeArea: { top: 350, right: 10, bottom: 260, left: 10 },
        })
      ).toThrow(/safeArea vertical insets .* cannot exceed or equal height/i);
    });

    it("throws at runtime when touchOnly is true but minTapTarget is missing or non-positive", () => {
      expect(() =>
        // @ts-expect-error - testing runtime guard against missing minTapTarget
        defineSurface({
          name: "touch-without-target",
          width: 390,
          height: 844,
          touchOnly: true,
        })
      ).toThrow(/touchOnly surface must specify a positive 'minTapTarget'/i);
    });

    it("throws at runtime when viewingDistance is far but minTextSize is missing or non-positive", () => {
      expect(() =>
        // @ts-expect-error - testing runtime guard against missing minTextSize
        defineSurface({
          name: "far-without-text-size",
          width: 1920,
          height: 1080,
          viewingDistance: "far",
        })
      ).toThrow(/viewingDistance "far" surface must specify a positive 'minTextSize'/i);
    });
  });

  describe("Compile-time type enforcement proofs", () => {
    it("enforces required fields at compile-time via conditional type constraints", () => {
      expect(() =>
        // @ts-expect-error - touchOnly: true requires minTapTarget: number
        defineSurface({
          name: "test-touch-invalid",
          width: 360,
          height: 640,
          touchOnly: true,
        })
      ).toThrow(/minTapTarget/i);

      expect(() =>
        // @ts-expect-error - viewingDistance: "far" requires minTextSize: number
        defineSurface({
          name: "test-far-invalid",
          width: 1920,
          height: 1080,
          viewingDistance: "far",
        })
      ).toThrow(/minTextSize/i);
    });
  });
});

describe("Phase 2: Resolver Core & Axis Derivation", () => {
  describe("deriveAxis", () => {
    it("derives 'vertical' for aspect ratios < 0.8", () => {
      expect(deriveAxis(mobilePortrait)).toBe("vertical");
    });

    it("derives 'horizontal-band' for aspect ratios > 2.2", () => {
      expect(deriveAxis(broadcastLowerThird)).toBe("horizontal-band");
    });

    it("derives 'grid' for 0.8 <= aspect ratio <= 2.2", () => {
      expect(deriveAxis(squareKiosk)).toBe("grid");
      expect(deriveAxis(mobileLandscape)).toBe("grid");
    });
  });
});

describe("Phase 3 & 4: Degradation Cascade, Invariants & Automated Test Suite", () => {
  describe("Happy Path: All canonical demo surfaces resolve without overlap or clip", () => {
    const requiredSurfaces = [
      { label: "Mobile Portrait", surface: mobilePortrait },
      { label: "Mobile Landscape", surface: mobileLandscape },
      { label: "Broadcast Lower-Third", surface: broadcastLowerThird },
      { label: "Square Kiosk", surface: squareKiosk },
    ];

    it.each(requiredSurfaces)(
      "resolves $label correctly and satisfies assertNoOverlapOrClip",
      ({ surface }) => {
        const layout = resolveLayout(testAdSpec, surface, mockTextMeasurer);

        expect(layout).toBeDefined();
        expect(layout.length).toBeGreaterThan(0);

        // Invariant check passes structurally
        expect(() => assertNoOverlapOrClip(layout, surface)).not.toThrow();

        // All elements are positioned within bounds
        const safeLeft = surface.safeArea?.left ?? 0;
        const safeTop = surface.safeArea?.top ?? 0;
        const safeRight = surface.safeArea?.right ?? 0;
        const safeBottom = surface.safeArea?.bottom ?? 0;

        for (const el of layout.filter((e) => e.visible)) {
          expect(el.x).toBeGreaterThanOrEqual(safeLeft - 0.01);
          expect(el.y).toBeGreaterThanOrEqual(safeTop - 0.01);
          expect(el.x + el.width).toBeLessThanOrEqual(surface.width - safeRight + 0.01);
          expect(el.y + el.height).toBeLessThanOrEqual(surface.height - safeBottom + 0.01);
        }
      }
    );
  });

  describe("Degradation Cascade: Progressive Shrink -> Reposition -> Drop", () => {
    it("shrinks lowest priority element (branding) on moderately constrained kiosk surface without dropping it", () => {
      const layout = resolveLayout(testAdSpec, squareKioskCompact, mockTextMeasurer);

      const headline = layout.find((e) => e.id === "headline")!;
      const cta = layout.find((e) => e.id === "cta")!;
      const branding = layout.find((e) => e.id === "logo")!;

      // All elements remain visible at this moderate constraint level
      expect(headline.visible).toBe(true);
      expect(cta.visible).toBe(true);
      expect(branding.visible).toBe(true);

      // Branding is degraded (shrunk/repositioned) rather than immediately dropped
      expect(["shrunk", "repositioned"]).toContain(branding.degraded);

      // Invariant check passes
      expect(() => assertNoOverlapOrClip(layout, squareKioskCompact)).not.toThrow();
    });

    it("drops lowest priority element (branding) cleanly on severely tight kiosk surface while keeping headline and cta intact", () => {
      const layout = resolveLayout(testAdSpec, squareKioskTight, mockTextMeasurer);

      const headline = layout.find((e) => e.id === "headline")!;
      const cta = layout.find((e) => e.id === "cta")!;
      const branding = layout.find((e) => e.id === "logo")!;

      // Headline and CTA (priority 1) MUST remain visible and intact
      expect(headline.visible).toBe(true);
      expect(cta.visible).toBe(true);

      // Branding (priority 3) is dropped cleanly when space cannot accommodate even shrunk branding
      expect(branding.visible).toBe(false);
      expect(branding.degraded).toBe("dropped");

      // Invariant check passes
      expect(() => assertNoOverlapOrClip(layout, squareKioskTight)).not.toThrow();
    });

    it("drops branding and secondary text when vertical height is severely restricted", () => {
      const tightVerticalSurface = defineSurface({
        name: "tight-vertical-phone",
        width: 200,
        height: 280,
        touchOnly: true,
        minTapTarget: 44,
      });

      const layout = resolveLayout(testAdSpec, tightVerticalSurface, mockTextMeasurer);

      const headline = layout.find((e) => e.id === "headline")!;
      const cta = layout.find((e) => e.id === "cta")!;
      const logo = layout.find((e) => e.id === "logo")!;

      expect(headline.visible).toBe(true);
      expect(cta.visible).toBe(true);
      expect(logo.visible).toBe(false);
      expect(logo.degraded).toBe("dropped");

      expect(() => assertNoOverlapOrClip(layout, tightVerticalSurface)).not.toThrow();
    });
  });

  describe("Centering & Alignment in Vertical Layout", () => {
    it("centers CTA button and branding horizontally in vertical portrait layout", () => {
      const layout = resolveLayout(testAdSpec, mobilePortrait, mockTextMeasurer);

      const cta = layout.find((e) => e.id === "cta")!;
      const branding = layout.find((e) => e.id === "logo")!;

      expect(cta.visible).toBe(true);
      expect(branding.visible).toBe(true);

      const safeLeft = mobilePortrait.safeArea?.left ?? 0;
      const safeRight = mobilePortrait.safeArea?.right ?? 0;
      const contentWidth = mobilePortrait.width - safeLeft - safeRight - 16 * 2; // stage padding = 16

      const expectedCtaX = safeLeft + 16 + Math.floor((contentWidth - cta.width) / 2);
      const expectedBrandingX = safeLeft + 16 + Math.floor((contentWidth - branding.width) / 2);

      expect(cta.x).toBe(expectedCtaX);
      expect(branding.x).toBe(expectedBrandingX);
    });
  });

  describe("Generic Multi-Element Category Support (No Singleton Hardcoding)", () => {
    it("resolves an ad spec with multiple heroes and multiple action buttons on horizontal-band", () => {
      const multiElementSpec: AdSpec = defineAd({
        elements: [
          { id: "hero-1", type: "image", role: "hero", priority: 1, content: "https://img.com/1" },
          { id: "hero-2", type: "image", role: "hero", priority: 2, content: "https://img.com/2" },
          { id: "headline", type: "text", role: "primary", priority: 1, content: "Big Sale" },
          { id: "price", type: "text", role: "secondary", priority: 2, content: "$99" },
          { id: "cta-primary", type: "button", role: "action", priority: 1, content: "Buy Now" },
          { id: "cta-secondary", type: "button", role: "action", priority: 2, content: "Learn More" },
          { id: "logo", type: "image", role: "branding", priority: 3, content: "BRAND" },
        ],
      });

      const layout = resolveLayout(multiElementSpec, broadcastLowerThird, mockTextMeasurer);

      expect(() => assertNoOverlapOrClip(layout, broadcastLowerThird)).not.toThrow();

      const hero1 = layout.find((e) => e.id === "hero-1")!;
      const hero2 = layout.find((e) => e.id === "hero-2")!;
      const cta1 = layout.find((e) => e.id === "cta-primary")!;
      const cta2 = layout.find((e) => e.id === "cta-secondary")!;

      expect(hero1.visible).toBe(true);
      expect(hero2.visible).toBe(true);
      expect(cta1.visible).toBe(true);
      expect(cta2.visible).toBe(true);

      // Heroes do not overlap
      expect(hero1.x + hero1.width).toBeLessThanOrEqual(hero2.x + 0.01);
      // CTAs do not overlap
      expect(cta1.x + cta1.width).toBeLessThanOrEqual(cta2.x + 0.01);
    });

    it("resolves an ad spec with NO hero element into a balanced 2-column grid on square kiosk", () => {
      const noHeroSpec: AdSpec = defineAd({
        elements: [
          { id: "logo", type: "image", role: "branding", priority: 3, content: "BRAND" },
          { id: "headline", type: "text", role: "primary", priority: 1, content: "Flash Sale" },
          { id: "price", type: "text", role: "secondary", priority: 2, content: "Only $19" },
          { id: "cta", type: "button", role: "action", priority: 1, content: "Claim Deal" },
        ],
      });

      const layout = resolveLayout(noHeroSpec, squareKiosk, mockTextMeasurer);

      expect(() => assertNoOverlapOrClip(layout, squareKiosk)).not.toThrow();

      const visible = layout.filter((e) => e.visible);
      expect(visible.length).toBe(4);

      // Elements are distributed across at least 2 columns rather than a single 1-column stack
      const xCoords = new Set(visible.map((e) => e.x));
      expect(xCoords.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Hard Constraint Enforcement", () => {
    it("never produces an interactive element below minTapTarget on touchOnly surfaces", () => {
      const customTouchSurface = defineSurface({
        name: "custom-touch",
        width: 380,
        height: 700,
        touchOnly: true,
        minTapTarget: 52,
      });

      const layout = resolveLayout(testAdSpec, customTouchSurface, mockTextMeasurer);
      const cta = layout.find((e) => e.id === "cta")!;

      expect(cta.visible).toBe(true);
      expect(cta.height).toBeGreaterThanOrEqual(52);
      expect(cta.width).toBeGreaterThanOrEqual(52);
    });

    it("never produces text below minTextSize on viewingDistance far surfaces", () => {
      const customFarSurface = defineSurface({
        name: "highway-billboard",
        width: 2400,
        height: 400,
        viewingDistance: "far",
        minTextSize: 28,
      });

      const layout = resolveLayout(testAdSpec, customFarSurface, mockTextMeasurer);
      const headline = layout.find((e) => e.id === "headline")!;

      expect(headline.visible).toBe(true);
      expect(headline.fontSize).toBeGreaterThanOrEqual(28);
    });

    it("hardConstraintFloor returns strictly positive minimums for all elements", () => {
      for (const el of testAdSpec.elements) {
        const floor = hardConstraintFloor(el, mobilePortrait);
        expect(floor.minWidth).toBeGreaterThan(0);
        expect(floor.minHeight).toBeGreaterThan(0);
      }
    });
  });

  describe("Impossible Constraint Handling", () => {
    it("throws LayoutError when surface is too small for priority 1 elements even at their floors", () => {
      const impossibleSurface = defineSurface({
        name: "impossible-micro-watch",
        width: 30,
        height: 20,
      });

      expect(() => resolveLayout(testAdSpec, impossibleSurface, mockTextMeasurer)).toThrow(
        LayoutError
      );
    });

    it("throws LayoutError when safeArea consumes entire surface dimensions", () => {
      const blockedSurface = defineSurface({
        name: "blocked-safe-area",
        width: 200,
        height: 200,
        safeArea: { top: 95, bottom: 95, left: 95, right: 95 },
      });

      expect(() => resolveLayout(testAdSpec, blockedSurface, mockTextMeasurer)).toThrow(
        LayoutError
      );
    });
  });

  describe("Generalization to Unseen 5th Surfaces", () => {
    it("resolves an ultra-wide skyscraper ribbon (2400x300) without throwing or overlapping", () => {
      const unseenRibbon = defineSurface({
        name: "unseen-ribbon-ticker",
        width: 2400,
        height: 300,
        viewingDistance: "far",
        minTextSize: 20,
      });

      const layout = resolveLayout(testAdSpec, unseenRibbon, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, unseenRibbon)).not.toThrow();
    });

    it("resolves an ultra-tall elevator display (600x1800) without throwing or overlapping", () => {
      const unseenElevatorDisplay = defineSurface({
        name: "unseen-elevator-column",
        width: 600,
        height: 1800,
        touchOnly: true,
        minTapTarget: 44,
      });

      const layout = resolveLayout(testAdSpec, unseenElevatorDisplay, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, unseenElevatorDisplay)).not.toThrow();
    });

    it("resolves a square compact smartwatch-style display (300x300) without throwing or overlapping", () => {
      const unseenSmartDisplay = defineSurface({
        name: "unseen-compact-display",
        width: 300,
        height: 300,
        touchOnly: true,
        minTapTarget: 40,
      });

      const layout = resolveLayout(testAdSpec, unseenSmartDisplay, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, unseenSmartDisplay)).not.toThrow();
    });

    it("resolves an in-car automotive panoramic cockpit HUD (2560x720) with horizontal-band flow and touch floors", () => {
      const automotiveHUD = defineSurface({
        name: "in-car-panoramic-hud",
        width: 2560,
        height: 720,
        safeArea: { top: 24, right: 60, bottom: 24, left: 60 },
        touchOnly: true,
        minTapTarget: 56,
      });

      expect(deriveAxis(automotiveHUD)).toBe("horizontal-band");

      const layout = resolveLayout(testAdSpec, automotiveHUD, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, automotiveHUD)).not.toThrow();

      const cta = layout.find((e) => e.id === "cta")!;
      expect(cta.visible).toBe(true);
      expect(cta.height).toBeGreaterThanOrEqual(56);
      expect(cta.width).toBeGreaterThanOrEqual(56);
    });

    it("resolves a smart refrigerator portrait screen door (1080x1920) with asymmetric safe insets", () => {
      const fridgeDoor = defineSurface({
        name: "smart-fridge-door",
        width: 1080,
        height: 1920,
        safeArea: { top: 160, right: 40, bottom: 220, left: 40 },
        touchOnly: true,
        minTapTarget: 48,
      });

      expect(deriveAxis(fridgeDoor)).toBe("vertical");

      const layout = resolveLayout(testAdSpec, fridgeDoor, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, fridgeDoor)).not.toThrow();

      const visibleEls = layout.filter((e) => e.visible);
      for (const el of visibleEls) {
        expect(el.x).toBeGreaterThanOrEqual(fridgeDoor.safeArea!.left);
        expect(el.y).toBeGreaterThanOrEqual(fridgeDoor.safeArea!.top);
        expect(el.x + el.width).toBeLessThanOrEqual(fridgeDoor.width - fridgeDoor.safeArea!.right);
        expect(el.y + el.height).toBeLessThanOrEqual(fridgeDoor.height - fridgeDoor.safeArea!.bottom);
      }
    });

    it("resolves an outdoor stadium mega-jumbotron (3840x1080) with far viewing text size floor", () => {
      const stadiumJumbotron = defineSurface({
        name: "stadium-jumbotron",
        width: 3840,
        height: 1080,
        safeArea: { top: 48, right: 96, bottom: 48, left: 96 },
        viewingDistance: "far",
        minTextSize: 36,
      });

      const layout = resolveLayout(testAdSpec, stadiumJumbotron, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, stadiumJumbotron)).not.toThrow();

      const headline = layout.find((e) => e.id === "headline")!;
      expect(headline.visible).toBe(true);
      expect(headline.fontSize).toBeGreaterThanOrEqual(36);
    });

    it("resolves a wearable micro HUD (280x280) without overlap and handles tight micro HUD (260x180) with graceful priority degradation", () => {
      const wearableMicroHUD = defineSurface({
        name: "wearable-micro-hud",
        width: 280,
        height: 280,
        safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
        touchOnly: true,
        minTapTarget: 40,
      });

      const layout = resolveLayout(testAdSpec, wearableMicroHUD, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, wearableMicroHUD)).not.toThrow();

      // Priority 1 elements must always remain visible and within touch floor
      const headline = layout.find((e) => e.id === "headline")!;
      const cta = layout.find((e) => e.id === "cta")!;
      expect(headline.visible).toBe(true);
      expect(cta.visible).toBe(true);
      expect(cta.height).toBeGreaterThanOrEqual(40);

      // On a tighter micro display (260x180), lowest priority element (branding) drops
      const tightMicroHUD = defineSurface({
        name: "tight-micro-hud",
        width: 260,
        height: 180,
        safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
        touchOnly: true,
        minTapTarget: 40,
      });

      const tightLayout = resolveLayout(testAdSpec, tightMicroHUD, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(tightLayout, tightMicroHUD)).not.toThrow();

      const tightLogo = tightLayout.find((e) => e.id === "logo")!;
      expect(tightLogo.visible).toBe(false);
      expect(tightLogo.degraded).toBe("dropped");
    });
  });

  describe("assertNoOverlapOrClip invariant validator", () => {
    it("throws LayoutError when two visible elements overlap", () => {
      const collidingLayout = [
        { id: "el1", x: 50, y: 50, width: 100, height: 100, visible: true },
        { id: "el2", x: 80, y: 80, width: 100, height: 100, visible: true },
      ];

      expect(() => assertNoOverlapOrClip(collidingLayout, squareKiosk)).toThrow(
        /Layout collision detected.*"el1".*overlaps with.*"el2"/i
      );
    });

    it("throws LayoutError when an element clips outside surface bounds", () => {
      const clippingLayout = [
        { id: "el1", x: 750, y: 10, width: 100, height: 100, visible: true },
      ];

      expect(() => assertNoOverlapOrClip(clippingLayout, squareKiosk)).toThrow(
        /clip outside safe area bounds/i
      );
    });

    it("ignores elements marked with visible: false", () => {
      const nonCollidingWithHidden = [
        { id: "el1", x: 50, y: 50, width: 100, height: 100, visible: true },
        { id: "el2", x: 50, y: 50, width: 100, height: 100, visible: false, degraded: "dropped" as const },
      ];

      expect(() => assertNoOverlapOrClip(nonCollidingWithHidden, squareKiosk)).not.toThrow();
    });
  });

  describe("Phase 7 Bonus: Canvas Renderer (render-canvas.ts)", () => {
    function createMockCanvasContext() {
      const drawnElements: { type: string; args: unknown[] }[] = [];
      const mockGradient = {
        addColorStop: () => {},
      };

      const ctx = {
        fillStyle: "#000000",
        strokeStyle: "#000000",
        lineWidth: 1,
        font: "16px sans-serif",
        textAlign: "left" as CanvasTextAlign,
        textBaseline: "top" as CanvasTextBaseline,
        save: () => drawnElements.push({ type: "save", args: [] }),
        restore: () => drawnElements.push({ type: "restore", args: [] }),
        fillRect: (x: number, y: number, w: number, h: number) => {
          drawnElements.push({ type: "fillRect", args: [x, y, w, h] });
        },
        strokeRect: (x: number, y: number, w: number, h: number) => {
          drawnElements.push({ type: "strokeRect", args: [x, y, w, h] });
        },
        createLinearGradient: () => mockGradient,
        beginPath: () => drawnElements.push({ type: "beginPath", args: [] }),
        closePath: () => drawnElements.push({ type: "closePath", args: [] }),
        moveTo: (x: number, y: number) => drawnElements.push({ type: "moveTo", args: [x, y] }),
        lineTo: (x: number, y: number) => drawnElements.push({ type: "lineTo", args: [x, y] }),
        quadraticCurveTo: () => {},
        fill: () => drawnElements.push({ type: "fill", args: [] }),
        stroke: () => drawnElements.push({ type: "stroke", args: [] }),
        clip: () => drawnElements.push({ type: "clip", args: [] }),
        setLineDash: (segments: number[]) => {
          drawnElements.push({ type: "setLineDash", args: [segments] });
        },
        fillText: (text: string, x: number, y: number) => {
          drawnElements.push({ type: "fillText", args: [text, x, y] });
        },
        measureText: (text: string) => ({
          width: text.length * 8,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }),
        drawImage: () => drawnElements.push({ type: "drawImage", args: [] }),
      } as unknown as CanvasRenderingContext2D;

      return { ctx, drawnElements };
    }

    it("renders a resolved layout onto a CanvasRenderingContext2D without throwing", () => {
      const { ctx, drawnElements } = createMockCanvasContext();
      const layout = resolveLayout(testAdSpec, mobilePortrait, mockTextMeasurer);

      expect(() => renderToCanvas(layout, testAdSpec, mobilePortrait, ctx, { showSafeAreas: true })).not.toThrow();
      expect(drawnElements.length).toBeGreaterThan(0);

      // Verify that fillText was called for text elements (headline, price, cta)
      const textCalls = drawnElements.filter((d) => d.type === "fillText");
      expect(textCalls.length).toBeGreaterThanOrEqual(3);
    });

    it("omits dropped elements from canvas drawing calls", () => {
      const { ctx, drawnElements } = createMockCanvasContext();
      const layout = resolveLayout(testAdSpec, squareKioskTight, mockTextMeasurer);

      // Logo is dropped on tight kiosk
      const logoEl = layout.find((e) => e.id === "logo")!;
      expect(logoEl.visible).toBe(false);

      renderToCanvas(layout, testAdSpec, squareKioskTight, ctx);

      // Verify that logo text is never drawn
      const drawnTexts = drawnElements
        .filter((d) => d.type === "fillText")
        .map((d) => String(d.args[0]));

      expect(drawnTexts.some((t) => t.includes("AURA AUDIO"))).toBe(false);
    });

    it("draws safe area dashes when showSafeAreas is true", () => {
      const { ctx, drawnElements } = createMockCanvasContext();
      const layout = resolveLayout(testAdSpec, mobilePortrait, mockTextMeasurer);

      renderToCanvas(layout, testAdSpec, mobilePortrait, ctx, { showSafeAreas: true });

      const dashCalls = drawnElements.filter((d) => d.type === "setLineDash");
      expect(dashCalls.length).toBeGreaterThan(0);
    });
  });
});
