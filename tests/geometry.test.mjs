import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const geom = require("../src/geometry.js");

test("screenToImage and imageToScreen round-trip accurately", () => {
  const view = { offsetX: 120, offsetY: 45, scale: 2.5 };
  const imgPt = { x: 310, y: 184 };
  const screenPt = geom.imageToScreen(imgPt, view);
  assert.deepEqual(screenPt, { x: 895, y: 505 });
  const back = geom.screenToImage(screenPt, view);
  assert.deepEqual(back, imgPt);
});

test("clampPointToImage keeps coordinates within [0, width] x [0, height]", () => {
  assert.deepEqual(geom.clampPointToImage({ x: -20, y: 950 }, 1200, 800), {
    x: 0,
    y: 800,
  });
  assert.deepEqual(geom.clampPointToImage({ x: 1500, y: -5 }, 1200, 800), {
    x: 1200,
    y: 0,
  });
});

test("snapAngle snaps cursor to 45-degree increments from origin", () => {
  const origin = { x: 100, y: 100 };
  const nearlyHorizontal = { x: 200, y: 104 };
  const snappedH = geom.snapAngle(origin, nearlyHorizontal, 45);
  assert.ok(Math.abs(snappedH.y - 100) < 1e-6);
  assert.ok(snappedH.x > 199);

  const nearlyDiagonal = { x: 198, y: 202 };
  const snappedD = geom.snapAngle(origin, nearlyDiagonal, 45);
  assert.ok(Math.abs(snappedD.x - snappedD.y) < 1e-6);
});

test("pointInPolygon detects interior and exterior points", () => {
  const lShape = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 100 },
  ];
  assert.equal(geom.pointInPolygon({ x: 25, y: 75 }, lShape), true);
  assert.equal(geom.pointInPolygon({ x: 75, y: 25 }, lShape), true);
  assert.equal(geom.pointInPolygon({ x: 75, y: 75 }, lShape), false);
});

test("polygonArea and polygonCentroid compute exact values for rectangle", () => {
  const rect = [
    { x: 100, y: 200 },
    { x: 500, y: 200 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ];
  assert.equal(geom.polygonArea(rect), 80000);
  const c = geom.polygonCentroid(rect);
  assert.deepEqual(c, { x: 300, y: 300 });
});

test("findClosestEdge finds insertion index for edge clicking", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const hitTop = geom.findClosestEdge({ x: 50, y: 3 }, rect, 8);
  assert.ok(hitTop);
  assert.equal(hitTop.edgeIndex, 0);
  assert.equal(hitTop.insertIndex, 1);
  assert.equal(hitTop.x, 50);
  assert.equal(hitTop.y, 0);

  const hitClosing = geom.findClosestEdge({ x: 2, y: 50 }, rect, 8);
  assert.ok(hitClosing);
  assert.equal(hitClosing.edgeIndex, 3);
  assert.equal(hitClosing.insertIndex, 4);
});

test("buildEdges returns closed vertex loop", () => {
  assert.deepEqual(geom.buildEdges(4), [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]);
});
