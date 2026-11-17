(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlanpointedGeometry = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function roundCoord(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  function screenToImage(screenPt, view) {
    return {
      x: (screenPt.x - view.offsetX) / view.scale,
      y: (screenPt.y - view.offsetY) / view.scale,
    };
  }

  function imageToScreen(imgPt, view) {
    return {
      x: imgPt.x * view.scale + view.offsetX,
      y: imgPt.y * view.scale + view.offsetY,
    };
  }

  function clampPointToImage(pt, width, height) {
    const maxW = Math.max(0, width || 0);
    const maxH = Math.max(0, height || 0);
    return {
      x: Math.min(maxW, Math.max(0, pt.x)),
      y: Math.min(maxH, Math.max(0, pt.y)),
    };
  }

  function distance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.hypot(dx, dy);
  }

  /**
   * Snap cursor to the nearest 45-degree angle increment from `origin`.
   */
  function snapAngle(origin, cursor, stepDeg = 45) {
    const dx = cursor.x - origin.x;
    const dy = cursor.y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return { x: cursor.x, y: cursor.y };
    }
    const stepRad = (stepDeg * Math.PI) / 180;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / stepRad) * stepRad;
    return {
      x: origin.x + Math.cos(snapped) * len,
      y: origin.y + Math.sin(snapped) * len,
    };
  }

  /**
   * Find the nearest existing room vertex within `maxDistImg` (in image pixels).
   */
  function findNearestVertex(cursorImg, rooms, maxDistImg, excludeRoomId = null) {
    let best = null;
    let bestDist = maxDistImg;
    for (const room of rooms) {
      if (room.visible === false) continue;
      if (excludeRoomId && room.id === excludeRoomId) continue;
      for (let i = 0; i < room.points.length; i++) {
        const pt = room.points[i];
        const d = distance(cursorImg, pt);
        if (d <= bestDist) {
          bestDist = d;
          best = {
            x: pt.x,
            y: pt.y,
            roomId: room.id,
            vertexIndex: i,
            distance: d,
          };
        }
      }
    }
    return best;
  }

  /**
   * Ray-casting point-in-polygon check.
   */
  function pointInPolygon(pt, points) {
    if (!points || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;

      const intersect =
        yi > pt.y !== yj > pt.y &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.0) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Unsigned area in square image pixels via shoelace formula.
   */
  function polygonArea(points) {
    if (!points || points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      sum += curr.x * next.y - next.x * curr.y;
    }
    return Math.abs(sum) / 2;
  }

  /**
   * Area-weighted centroid (falls back to vertex average if collinear).
   */
  function polygonCentroid(points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    if (points.length === 2) {
      return {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
    }

    let signedArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % points.length];
      const cross = p0.x * p1.y - p1.x * p0.y;
      signedArea += cross;
      cx += (p0.x + p1.x) * cross;
      cy += (p0.y + p1.y) * cross;
    }
    signedArea *= 0.5;

    if (Math.abs(signedArea) < 1e-5) {
      const avg = points.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 }
      );
      return { x: avg.x / points.length, y: avg.y / points.length };
    }

    return {
      x: cx / (6 * signedArea),
      y: cy / (6 * signedArea),
    };
  }

  /**
   * Distance and projection from `pt` onto segment [a, b].
   */
  function projectPointToSegment(pt, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-8) {
      return { x: a.x, y: a.y, t: 0, distance: distance(pt, a) };
    }
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
    const proj = { x: a.x + t * dx, y: a.y + t * dy };
    return {
      x: proj.x,
      y: proj.y,
      t,
      distance: distance(pt, proj),
    };
  }

  /**
   * Find closest polygon edge to `pt` within `maxDistImg`.
   */
  function findClosestEdge(pt, points, maxDistImg) {
    if (!points || points.length < 2) return null;
    let best = null;
    let bestDist = maxDistImg;
    for (let i = 0; i < points.length; i++) {
      const nextIndex = (i + 1) % points.length;
      const proj = projectPointToSegment(pt, points[i], points[nextIndex]);
      if (proj.distance <= bestDist) {
        bestDist = proj.distance;
        best = {
          edgeIndex: i,
          insertIndex: nextIndex === 0 ? points.length : nextIndex,
          x: proj.x,
          y: proj.y,
          distance: proj.distance,
        };
      }
    }
    return best;
  }

  /**
   * Build closed-loop edge pairs [[0, 1], [1, 2], ..., [n-1, 0]].
   */
  function buildEdges(pointCount) {
    if (pointCount < 2) return [];
    const edges = [];
    for (let i = 0; i < pointCount; i++) {
      edges.push([i, (i + 1) % pointCount]);
    }
    return edges;
  }

  return {
    roundCoord,
    screenToImage,
    imageToScreen,
    clampPointToImage,
    distance,
    snapAngle,
    findNearestVertex,
    pointInPolygon,
    polygonArea,
    polygonCentroid,
    projectPointToSegment,
    findClosestEdge,
    buildEdges,
  };
});
