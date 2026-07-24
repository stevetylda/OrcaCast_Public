export function fitRasterDimensionsToBudget(
  sourceWidth: number,
  sourceHeight: number,
  maxSide: number,
  maxPixels: number,
) {
  const safeWidth = Math.max(1, Math.round(sourceWidth));
  const safeHeight = Math.max(1, Math.round(sourceHeight));
  const sideScale = Math.min(1, maxSide / Math.max(safeWidth, safeHeight));
  let width = Math.max(1, Math.round(safeWidth * sideScale));
  let height = Math.max(1, Math.round(safeHeight * sideScale));

  if (width * height > maxPixels) {
    const pixelScale = Math.sqrt(maxPixels / (width * height));
    width = Math.max(1, Math.floor(width * pixelScale));
    height = Math.max(1, Math.floor(height * pixelScale));
  }

  return { width, height };
}

export function accumulateWeightedRaster(
  target: Float32Array,
  source: ArrayLike<number>,
  weight: number,
  nodataValue?: number | null,
  validMask?: Uint8Array,
) {
  if (source.length !== target.length) {
    throw new Error("Weighted raster dimensions do not match");
  }
  if (validMask && validMask.length !== target.length) {
    throw new Error("Weighted raster validity mask dimensions do not match");
  }
  if (!Number.isFinite(weight) || weight <= 0) return;
  for (let index = 0; index < target.length; index += 1) {
    const value = Number(source[index] ?? 0);
    if (isRasterNoData(value, nodataValue)) continue;
    if (validMask) validMask[index] = 1;
    target[index] += value * weight;
  }
}

export function isRasterNoData(
  value: number,
  nodataValue: number | null | undefined,
) {
  return (
    !Number.isFinite(value) ||
    (nodataValue !== undefined && nodataValue !== null && value === nodataValue)
  );
}
