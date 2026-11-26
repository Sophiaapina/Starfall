/** image loading for the render layer; drawing code checks ready() because images arrive after the first frames */

export const assetPath = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

/** starts loading an image under public/, path relative to the site root */
export function loadImage(path: string): HTMLImageElement {
  const img = new Image();
  img.src = assetPath(path);
  return img;
}

export function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}
