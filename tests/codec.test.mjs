import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const codec = require("../src/jsCodec.js");

const SAMPLE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("generateRoomsJs produces executable JS with const rooms dictionary and round-trips", () => {
  const inputRooms = [
    {
      id: "room_1",
      name: "Living Room",
      color: "#3b82f6",
      points: [
        { x: 100, y: 100 },
        { x: 540, y: 100 },
        { x: 540, y: 440 },
        { x: 100, y: 440 },
      ],
    },
    {
      id: "room_2",
      name: "Kitchen",
      color: "#10b981",
      points: [
        { x: 540, y: 100 },
        { x: 1100, y: 100 },
        { x: 1100, y: 380 },
        { x: 540, y: 380 },
      ],
    },
  ];

  const jsText = codec.generateRoomsJs({
    rooms: inputRooms,
    planMeta: {
      imageName: "apartment.png",
      imageWidth: 1200,
      imageHeight: 800,
      imageDataUrl: SAMPLE_DATA_URL,
    },
    embedImage: true,
    includeCommonJsExport: true,
    generatedAt: "2026-11-17T12:00:00.000Z",
  });

  // Verify it contains `const rooms = {`
  assert.match(jsText, /const rooms = \{/);

  // Verify it executes cleanly as JavaScript (CommonJS style)
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(jsText, sandbox);
  const vmResult = JSON.parse(JSON.stringify(sandbox.module.exports));
  assert.equal(vmResult.planMeta.imageWidth, 1200);
  assert.equal(vmResult.planMeta.imageHeight, 800);
  assert.ok(vmResult.rooms["Living Room"]);
  assert.deepEqual(vmResult.rooms["Kitchen"].edges, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]);

  // Verify safe parser round-trips without eval
  const parsed = codec.parseRoomsJs(jsText);
  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.planMeta.imageName, "apartment.png");
  assert.equal(parsed.planMeta.imageWidth, 1200);
  assert.equal(parsed.planMeta.imageHeight, 800);
  assert.equal(parsed.planMeta.imageDataUrl, SAMPLE_DATA_URL);
  assert.equal(parsed.rooms.length, 2);
  assert.equal(parsed.rooms[0].name, "Living Room");
  assert.deepEqual(parsed.rooms[0].points, inputRooms[0].points);
  assert.deepEqual(parsed.rooms[1].edges, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]);
});

test("parseRoomsJs supports export const, single quotes, comments, trailing commas, and [x, y] tuples", () => {
  const handEditedJs = `
    // Hand-edited floor plan rooms
    export const rooms = {
      'Hallway': {
        /* unquoted keys + tuple points + trailing comma */
        points: [
          [10, 20],
          [210, 20],
          [210, 80],
          [10, 80],
        ],
      },
    };
  `;

  const parsed = codec.parseRoomsJs(handEditedJs);
  assert.equal(parsed.rooms.length, 1);
  assert.equal(parsed.rooms[0].name, "Hallway");
  assert.deepEqual(parsed.rooms[0].points, [
    { x: 10, y: 20 },
    { x: 210, y: 20 },
    { x: 210, y: 80 },
    { x: 10, y: 80 },
  ]);
  assert.deepEqual(parsed.rooms[0].edges, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]);
  assert.equal(parsed.planMeta.imageDataUrl, null);
  assert.equal(parsed.warnings.length, 1);
});

test("parseRoomsJs reorders points when custom edges cycle is specified", () => {
  const customEdgesJs = `
    const rooms = {
      "Custom": {
        points: [
          { x: 0, y: 0 },     // 0
          { x: 100, y: 100 }, // 1 (opposite corner)
          { x: 100, y: 0 },   // 2
          { x: 0, y: 100 }    // 3
        ],
        edges: [
          [0, 2],
          [2, 1],
          [1, 3],
          [3, 0]
        ]
      }
    };
  `;

  const parsed = codec.parseRoomsJs(customEdgesJs);
  assert.equal(parsed.rooms.length, 1);
  assert.deepEqual(parsed.rooms[0].points, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]);
});

test("parseRoomsJs rejects executable code injection instead of evaluating it", () => {
  const maliciousJs = `
    const rooms = {
      "Evil": (() => { throw new Error("should not execute"); })()
    };
  `;
  assert.throws(() => codec.parseRoomsJs(maliciousJs));
});
