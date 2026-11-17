# Planpointed

A browser-based building plan mapper for tracing rooms as closed polygons, exporting them to a `.js` `rooms` dictionary, and reloading exported `.js` files for further editing.

## Features

- **Upload any plan image** via file picker, drag-and-drop, clipboard paste (`Ctrl+V`), or click **Sample** for a built-in architectural floor plan.
- **Click-to-trace rooms**: Place corner dots in **Draw** mode (`D`), snap to 45°/90° angles with `Shift`, snap to existing corners, and click the **first dot** again to close and name the room.
- **Edit polygons**: Switch to **Edit** mode (`V`) to select rooms, drag corner vertices, insert corners along edges, right-click corners to remove them, rename/recolor rooms, and undo/redo (`Ctrl+Z` / `Ctrl+Y`).
- **Export & reload `.js`**: Generates a `.js` file with `planMeta` and `const rooms = { ... }` keyed by room name. Coordinates are stored in image pixels relative to the picture's top-left `(0, 0)` with explicit `edges` pairs. Loading an exported `.js` file restores the project (including the floor plan image when embedded).

## Getting Started

Open `index.html` directly in your browser, or serve the folder locally:

```bash
npm run serve
```

## Export Format

```js
const planMeta = {
  version: 1,
  imageName: "floor-plan.png",
  imageWidth: 1200,
  imageHeight: 800,
  coordinateOrigin: "top-left",
  units: "px",
  imageDataUrl: "data:image/png;base64,..."
};

const rooms = {
  "Kitchen": {
    id: "room_1",
    name: "Kitchen",
    color: "#3b82f6",
    closed: true,
    points: [
      { x: 540, y: 100 },
      { x: 1100, y: 100 },
      { x: 1100, y: 380 },
      { x: 540, y: 380 }
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0]
    ]
  }
};
```

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `D` / `V` / `H` | Draw / Edit / Pan tool |
| `Shift` (while drawing) | Snap to 45° / 90° angles |
| `Backspace` (while drawing) | Undo last placed dot |
| `Esc` | Cancel active polygon or close modal |
| `Space + Drag` / Scroll | Pan / Zoom |
| `0` / `+` / `-` | Fit to screen / Zoom in / Zoom out |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |

## Tests

```bash
npm test
```
