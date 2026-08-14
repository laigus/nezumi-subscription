'use strict';

function roundedWindowShape(width, height, radius = 28) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Window dimensions must be positive integers');
  }
  const safeRadius = Math.max(0, Math.min(Math.floor(radius), Math.floor(width / 2), Math.floor(height / 2)));
  if (safeRadius === 0) return [{ x: 0, y: 0, width, height }];

  const rectangles = [];
  for (let row = 0; row < safeRadius; row += 1) {
    const distanceFromCenter = safeRadius - row - 0.5;
    const inset = Math.ceil(safeRadius - Math.sqrt((safeRadius ** 2) - (distanceFromCenter ** 2)));
    const rowWidth = width - (inset * 2);
    if (rowWidth > 0) {
      rectangles.push({ x: inset, y: row, width: rowWidth, height: 1 });
      rectangles.push({ x: inset, y: height - row - 1, width: rowWidth, height: 1 });
    }
  }
  const middleHeight = height - (safeRadius * 2);
  if (middleHeight > 0) rectangles.push({ x: 0, y: safeRadius, width, height: middleHeight });
  return rectangles;
}

function shapeContainsPoint(rectangles, x, y) {
  return rectangles.some((rect) => (
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
  ));
}

module.exports = { roundedWindowShape, shapeContainsPoint };
