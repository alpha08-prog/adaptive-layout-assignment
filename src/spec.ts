// spec.ts — AdElement / AdSpec types and defineAd() validator

export type ElementRole = "primary" | "hero" | "action" | "secondary" | "branding";
export type Priority = 1 | 2 | 3; // 1 = never drop, 3 = drop first
export type ElementType = "text" | "image" | "button";

export interface AdElement {
  id: string;
  type: ElementType;
  role: ElementRole;
  priority: Priority;
  content?: string;
}

export interface AdSpec {
  elements: AdElement[];
}

/**
 * Validates and returns an AdSpec.
 * Enforces runtime invariants:
 * 1. Must contain at least one element.
 * 2. All element IDs must be unique.
 * 3. All elements must have valid required fields.
 */
export function defineAd(spec: AdSpec): AdSpec {
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.elements)) {
    throw new Error("Invalid AdSpec: 'elements' must be an array.");
  }

  if (spec.elements.length === 0) {
    throw new Error("Invalid AdSpec: spec must contain at least one element.");
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < spec.elements.length; i++) {
    const element = spec.elements[i];
    if (!element || typeof element !== "object") {
      throw new Error(`Invalid AdElement at index ${i}: element must be an object.`);
    }

    if (!element.id || typeof element.id !== "string" || element.id.trim() === "") {
      throw new Error(`Invalid AdElement at index ${i}: 'id' must be a non-empty string.`);
    }

    if (seenIds.has(element.id)) {
      throw new Error(`Invalid AdSpec: Duplicate element ID found: "${element.id}". All element IDs must be unique.`);
    }
    seenIds.add(element.id);

    if (!element.type || !["text", "image", "button"].includes(element.type)) {
      throw new Error(`Invalid AdElement "${element.id}": unknown type "${String(element.type)}".`);
    }

    if (!element.role || !["primary", "hero", "action", "secondary", "branding"].includes(element.role)) {
      throw new Error(`Invalid AdElement "${element.id}": unknown role "${String(element.role)}".`);
    }

    if (![1, 2, 3].includes(element.priority)) {
      throw new Error(`Invalid AdElement "${element.id}": priority must be 1, 2, or 3 (received ${String(element.priority)}).`);
    }
  }

  return spec;
}
