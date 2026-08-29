// demo-spec.ts — Example product ad spec using defineAd()
import { defineAd, type AdSpec } from "./spec.ts";

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
