(function (root) {
  "use strict";

  /**
   * Generate a crisp 1200x800 architectural floor plan PNG data URL for instant testing.
   */
  function createSampleFloorPlan() {
    const width = 1200;
    const height = 800;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Clean architectural paper background
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    // Subtle drafting grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }

    // Room floor subtle tints (without text labels so user maps them!)
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(100, 100, 1000, 600);

    // Furniture hints (light architectural linework)
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    // Living Room sofa + table (top-left: 100..540, 100..440)
    ctx.strokeRect(140, 150, 160, 70);
    ctx.strokeRect(175, 250, 90, 50);
    // Kitchen counter + island (top-right: 540..1100, 100..380)
    ctx.strokeRect(560, 114, 520, 56);
    ctx.strokeRect(720, 230, 180, 70);
    // Bedroom bed (bottom-left: 100..500, 440..700)
    ctx.strokeRect(140, 500, 160, 150);
    ctx.strokeRect(150, 510, 60, 35);
    ctx.strokeRect(230, 510, 60, 35);
    // Bathroom fixtures (bottom-center: 500..780, 460..700)
    ctx.strokeRect(520, 610, 160, 70);
    ctx.beginPath();
    ctx.arc(730, 530, 24, 0, Math.PI * 2);
    ctx.stroke();
    // Study/Office desk (bottom-right: 780..1100, 380..700)
    ctx.strokeRect(940, 420, 130, 65);

    // Thick structural walls
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 10;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";

    // Outer perimeter
    ctx.strokeRect(100, 100, 1000, 600);

    // Interior walls
    const walls = [
      // Vertical divider between Living Room & Kitchen
      [540, 100, 540, 380],
      // Horizontal wall below Living Room (with hallway gap)
      [100, 440, 360, 440],
      [440, 440, 540, 440],
      // Hallway horizontal wall below Kitchen
      [540, 380, 660, 380],
      [740, 380, 1100, 380],
      // Vertical wall separating Bedroom & Bathroom
      [500, 440, 500, 700],
      // Wall separating Bathroom & Study (with door gap)
      [780, 380, 780, 460],
      [780, 540, 780, 700],
      // Top wall of Bathroom
      [500, 460, 600, 460],
      [680, 460, 780, 460],
    ];

    ctx.beginPath();
    for (const [x1, y1, x2, y2] of walls) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Windows on outer walls
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 6;
    const windows = [
      [220, 100, 380, 100],
      [740, 100, 920, 100],
      [100, 220, 100, 340],
      [1100, 480, 1100, 600],
      [200, 700, 340, 700],
    ];
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of windows) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Door swing arcs
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    const doors = [
      { cx: 360, cy: 440, r: 78, start: 0, end: Math.PI / 2 },
      { cx: 660, cy: 380, r: 78, start: 0, end: Math.PI / 2 },
      { cx: 600, cy: 460, r: 78, start: 0, end: Math.PI / 2 },
      { cx: 780, cy: 460, r: 78, start: 0, end: Math.PI / 2 },
    ];
    for (const d of doors) {
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, d.r, d.start, d.end);
      ctx.stroke();
    }

    // Subtle title block at bottom-right outside walls
    ctx.fillStyle = "#64748b";
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.fillText("SAMPLE ARCHITECTURAL FLOOR PLAN — 1200 × 800 PX", 100, 742);

    return {
      imageDataUrl: canvas.toDataURL("image/png"),
      imageName: "sample-floor-plan.png",
      imageWidth: width,
      imageHeight: height,
    };
  }

  root.PlanpointedSample = {
    createSampleFloorPlan,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
