export const brand = {
  name: "nammapros.",
  tagline: "Your Home. Our Expertise.",
  burgundy: "#800020",
  ink: "#111111",
  canvas: "#F8F8F8",
} as const;

export const problemSuggestions = [
  { label: "AC not cooling", serviceSlug: "ac-service-repair" },
  { label: "AC water leakage", serviceSlug: "ac-service-repair" },
  { label: "Washing machine not spinning", serviceSlug: "washing-machine-repair" },
  { label: "Refrigerator not cooling", serviceSlug: "refrigerator-repair" },
  { label: "Water leakage", serviceSlug: "plumber" },
  { label: "Water tap leaking", serviceSlug: "plumber" },
  { label: "Fan not working", serviceSlug: "electrician" },
  { label: "Power socket not working", serviceSlug: "electrician" },
] as const;
