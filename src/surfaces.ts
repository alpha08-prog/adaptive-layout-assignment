// surfaces.ts — SurfaceProfile types and defineSurface() validator

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SurfaceProfile {
  name: string;
  width: number;
  height: number;
  safeArea?: SafeArea;
  touchOnly?: boolean;
  minTapTarget?: number;
  viewingDistance?: "near" | "far";
  minTextSize?: number;
}

/**
 * Validates and returns a SurfaceProfile.
 *
 * Compile-time enforcement:
 * - touchOnly=true requires minTapTarget: number
 * - viewingDistance="far" requires minTextSize: number
 *
 * Runtime enforcement:
 * - width and height must be positive numbers.
 * - safeArea insets must be non-negative and not exceed surface dimensions.
 * - touchOnly=true requires valid positive minTapTarget.
 * - viewingDistance="far" requires valid positive minTextSize.
 */
export function defineSurface<const T extends SurfaceProfile>(
  profile: T &
    (T["touchOnly"] extends true ? { minTapTarget: number } : {}) &
    (T["viewingDistance"] extends "far" ? { minTextSize: number } : {})
): T {
  if (!profile || typeof profile !== "object") {
    throw new Error("Invalid SurfaceProfile: profile must be an object.");
  }

  if (typeof profile.name !== "string" || profile.name.trim() === "") {
    throw new Error("Invalid SurfaceProfile: 'name' must be a non-empty string.");
  }

  if (typeof profile.width !== "number" || !Number.isFinite(profile.width) || profile.width <= 0) {
    throw new Error(`Invalid SurfaceProfile "${profile.name}": 'width' must be a positive number (received ${String(profile.width)}).`);
  }

  if (typeof profile.height !== "number" || !Number.isFinite(profile.height) || profile.height <= 0) {
    throw new Error(`Invalid SurfaceProfile "${profile.name}": 'height' must be a positive number (received ${String(profile.height)}).`);
  }

  if (profile.safeArea !== undefined) {
    const { top, right, bottom, left } = profile.safeArea;
    const insets = [
      { name: "top", val: top },
      { name: "right", val: right },
      { name: "bottom", val: bottom },
      { name: "left", val: left },
    ];

    for (const inset of insets) {
      if (typeof inset.val !== "number" || !Number.isFinite(inset.val) || inset.val < 0) {
        throw new Error(`Invalid SurfaceProfile "${profile.name}": safeArea.${inset.name} must be a non-negative number.`);
      }
    }

    if (left + right >= profile.width) {
      throw new Error(
        `Invalid SurfaceProfile "${profile.name}": safeArea horizontal insets (left: ${left} + right: ${right} = ${left + right}px) cannot exceed or equal width (${profile.width}px).`
      );
    }

    if (top + bottom >= profile.height) {
      throw new Error(
        `Invalid SurfaceProfile "${profile.name}": safeArea vertical insets (top: ${top} + bottom: ${bottom} = ${top + bottom}px) cannot exceed or equal height (${profile.height}px).`
      );
    }
  }

  if (profile.touchOnly === true) {
    if (typeof profile.minTapTarget !== "number" || !Number.isFinite(profile.minTapTarget) || profile.minTapTarget <= 0) {
      throw new Error(
        `Invalid SurfaceProfile "${profile.name}": touchOnly surface must specify a positive 'minTapTarget' (received ${String(profile.minTapTarget)}).`
      );
    }
  }

  if (profile.viewingDistance === "far") {
    if (typeof profile.minTextSize !== "number" || !Number.isFinite(profile.minTextSize) || profile.minTextSize <= 0) {
      throw new Error(
        `Invalid SurfaceProfile "${profile.name}": viewingDistance "far" surface must specify a positive 'minTextSize' (received ${String(profile.minTextSize)}).`
      );
    }
  }

  return profile;
}
