/**
 * Ratio de contraste WCAG entre deux couleurs (fond, texte). Renvoie `null` si l'une n'est pas un
 * hex simple (ex. un dégradé) — dans ce cas on n'affiche pas d'alerte. Seuil lisible ≈ 4.5:1 (texte
 * normal), 3:1 acceptable pour un petit badge en gras.
 */
export function contrasteWcag(bg: string, fg: string): number | null {
  const rb = versRgb(bg);
  const rf = versRgb(fg);
  if (!rb || !rf) return null;
  const lb = luminance(rb);
  const lf = luminance(rf);
  const hi = Math.max(lb, lf);
  const lo = Math.min(lb, lf);
  return (hi + 0.05) / (lo + 0.05);
}

/** `true` si le contraste est suffisant pour un badge (≥ 3:1), ou indéterminable (dégradé). */
export function contrasteOk(bg: string, fg: string): boolean {
  const c = contrasteWcag(bg, fg);
  return c === null || c >= 3;
}

function versRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1];
  return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
