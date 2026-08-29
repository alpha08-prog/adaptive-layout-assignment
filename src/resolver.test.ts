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
} from "./resolver.ts";
import { mockTextMeasurer } from "./measure.ts";
import { demoAdSpec } from "./demo-spec.ts";
import {
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  squareKiosk,
  squareKioskTight,
} from "./demo-surfaces.ts";

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
      const mobileSurface = defineSurface({
        name: "mobile-portrait",
        width: 390,
        height: 844,
        touchOnly: true,
        minTapTarget: 48,
      });

      expect(mobileSurface.touchOnly).toBe(true);
      expect(mobileSurface.minTapTarget).toBe(48);
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
  describe("Happy Path: All 4 canonical demo surfaces resolve without overlap or clip", () => {
    const requiredSurfaces = [
      { label: "Mobile Portrait", surface: mobilePortrait },
      { label: "Mobile Landscape", surface: mobileLandscape },
      { label: "Broadcast Lower-Third", surface: broadcastLowerThird },
      { label: "Square Kiosk", surface: squareKiosk },
    ];

    it.each(requiredSurfaces)(
      "resolves $label correctly and satisfies assertNoOverlapOrClip",
      ({ surface }) => {
        const layout = resolveLayout(demoAdSpec, surface, mockTextMeasurer);

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

  describe("Degradation Cascade", () => {
    it("drops lowest priority element (branding) on tight kiosk surface while keeping headline and cta intact", () => {
      const layout = resolveLayout(demoAdSpec, squareKioskTight, mockTextMeasurer);

      const headline = layout.find((e) => e.id === "headline")!;
      const cta = layout.find((e) => e.id === "cta")!;
      const branding = layout.find((e) => e.id === "logo")!;

      // Headline and CTA (priority 1) MUST remain visible and intact
      expect(headline.visible).toBe(true);
      expect(cta.visible).toBe(true);

      // Branding (priority 3) is dropped to satisfy spatial constraints
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

      const layout = resolveLayout(demoAdSpec, tightVerticalSurface, mockTextMeasurer);

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

  describe("Hard Constraint Enforcement", () => {
    it("never produces an interactive element below minTapTarget on touchOnly surfaces", () => {
      const customTouchSurface = defineSurface({
        name: "custom-touch",
        width: 380,
        height: 700,
        touchOnly: true,
        minTapTarget: 52,
      });

      const layout = resolveLayout(demoAdSpec, customTouchSurface, mockTextMeasurer);
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

      const layout = resolveLayout(demoAdSpec, customFarSurface, mockTextMeasurer);
      const headline = layout.find((e) => e.id === "headline")!;

      expect(headline.visible).toBe(true);
      expect(headline.fontSize).toBeGreaterThanOrEqual(28);
    });

    it("hardConstraintFloor returns strictly positive minimums for all elements", () => {
      for (const el of demoAdSpec.elements) {
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

      expect(() => resolveLayout(demoAdSpec, impossibleSurface, mockTextMeasurer)).toThrow(
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

      expect(() => resolveLayout(demoAdSpec, blockedSurface, mockTextMeasurer)).toThrow(
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

      const layout = resolveLayout(demoAdSpec, unseenRibbon, mockTextMeasurer);
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

      const layout = resolveLayout(demoAdSpec, unseenElevatorDisplay, mockTextMeasurer);
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

      const layout = resolveLayout(demoAdSpec, unseenSmartDisplay, mockTextMeasurer);
      expect(() => assertNoOverlapOrClip(layout, unseenSmartDisplay)).not.toThrow();
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
        { id: "el1", x: 750, y: 10, width: 100, height: 100, visible: true }, // 750 + 100 = 850 > 800
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
});
