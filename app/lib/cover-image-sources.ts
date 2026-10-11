// Only the trusted showcase image service supports these resize parameters.
// Uploaded/private images and unrelated external URLs keep their exact URL.
//
// Geometry rules (imgix-style params on images.unsplash.com):
// - Never touch `fit`/`crop`/`rect`/`ar`: the author's crop/clip/max intent is kept.
// - When the original has `h`, every variant scales `h` by the same factor as `w`,
//   so the output aspect ratio is unchanged (rect only selects the source region;
//   the w/h ratio of the output still governs the aspect).
// - When the original has `h` but no usable `w`, the aspect cannot be preserved
//   safely, so the URL is left exactly as is.
// - Candidates never exceed the original `w` (the author's chosen upper bound);
//   the original width itself is always a candidate so full-width heroes can
//   still pick the size they used to load.
const DEFAULT_WIDTHS = [320, 640, 960, 1280];
const DEFAULT_SRC_WIDTH = 640;

function positiveNumber(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function coverImageSources(src: string): { src: string; srcSet?: string } {
  try {
    const url = new URL(src);
    if (url.origin !== "https://images.unsplash.com") return { src };
    const originalWidth = positiveNumber(url.searchParams.get("w"));
    const hasHeight = url.searchParams.has("h");
    const originalHeight = positiveNumber(url.searchParams.get("h"));
    if (hasHeight && (originalWidth === null || originalHeight === null)) return { src };
    const auto = url.searchParams.get("auto");
    const autoValue = !auto ? "format" : auto.split(",").includes("format") ? auto : `${auto},format`;
    const variant = (width: number) => {
      const resized = new URL(url);
      resized.searchParams.set("auto", autoValue);
      resized.searchParams.set("w", String(width));
      if (originalWidth !== null && originalHeight !== null) {
        resized.searchParams.set("h", String(Math.max(1, Math.round((originalHeight * width) / originalWidth))));
      }
      resized.searchParams.set("q", "80");
      return resized.href;
    };
    const cap = originalWidth === null ? null : Math.round(originalWidth);
    const widths = cap === null ? DEFAULT_WIDTHS : [...DEFAULT_WIDTHS.filter((width) => width < cap), cap];
    const srcWidth = cap === null ? DEFAULT_SRC_WIDTH : Math.min(DEFAULT_SRC_WIDTH, cap);
    return {
      src: variant(srcWidth),
      srcSet: widths.map((width) => `${variant(width)} ${width}w`).join(", "),
    };
  } catch {
    return { src };
  }
}

// `sizes` hints shared by every place that renders a product cover, so that two
// renderings of the same photo on one page resolve to the same srcset candidate
// (one download instead of two). Lives here (not in the "use client" ProductCard
// module) so server components can import plain strings.
export const PRODUCT_CARD_SIZES = {
  standard: "(max-width: 640px) 100vw, (max-width: 1200px) 40vw, 360px",
  large: "(max-width: 640px) 100vw, (max-width: 1200px) 60vw, 720px",
} as const;

// Full-bleed product hero: .immersive-experience spans .product-detail-page
// (max-width: 1260px in globals.css), so 100vw is the upper bound below that.
export const PRODUCT_HERO_SIZES = "(max-width: 1260px) 100vw, 1260px";
