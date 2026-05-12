# Icon Sources

## 2D UI icons

- Scope: local SVG icon components in `src/components/ui/CyberIcons.tsx`.
- Direction: selected to match the open SVG catalog direction reviewed from proIcons and OpenIconLibrary, especially single-color outline icon families such as Tabler, Phosphor, and Iconoir.
- Integration rule: keep the existing `PixelIcon` API and Cyber-Pixel styling instead of adding a runtime icon package.

## 3D accent icons

- Scope: reward and emoji-replacement accents only.
- Source family: 3dicons.co by Vijay Verma.
- License basis: 3dicons.co icon pages and Wikimedia Commons mirrors list the selected assets as CC0.
- Local files:
  - `public/icons/3d/trophy-front-color.png`
  - `public/icons/3d/medal-front-color.png`
  - `public/icons/3d/crown-front-color.png`
  - `public/icons/3d/cube-front-color.png`
  - `public/icons/3d/shield-front-color.png`

## Non-goals

- Existing project images are not replaced.
- Rank, position, favicon, thumbnail, and hall-of-fame trophy image assets remain unchanged.
- 3D icons are not used for small action buttons, table cells, or inline controls.
