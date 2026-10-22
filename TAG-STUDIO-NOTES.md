# Tag Studio notes (v0.5.7)

This release adds an in-system **Tag Studio** for creating and exporting graffiti-style **SVG** tags.

## Open-licensed building blocks researched

These are suitable candidates if you want the next version to move beyond the current built-in SVG generator:

1. **perfect-freehand** — MIT  
   Pressure-style freehand stroke generation. Excellent for sketchy handstyle linework.
2. **tagmaker** — MIT  
   SVG tag/template generator. Useful reference for export workflows.
3. **svg-drawing** — MIT  
   SVG sketch/export canvas with replay and drawing features.
4. **Excalidraw** — MIT  
   Much larger integration, but strong editing/export UX and SVG export.

## What this release does now

- Creates clean vector graffiti tags inside The Smoke.
- Lets the player roll a Smoke stat and map the result to tag quality.
- Saves tag presets on a character.
- Exports the current design as SVG.
- Supports transparent output for use as overlays or art assets.

## Good next step

If you want **true drawn handstyle strokes**, the best next upgrade path is:

- integrate `perfect-freehand` for stroke generation,
- store raw stroke data in the flag,
- export both raw SVG and a tile-ready version.
