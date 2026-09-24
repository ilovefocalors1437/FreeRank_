# Design

Tokens live in `web/src/styles/global.css`. This is the why.

## Colour
- **Klein blue (IKB) is the brand.** `--cobalt` oklch(0.38 0.2 265) carries the landing hero, the ladder band and Competitive surfaces. On app surfaces it's used only for primary actions and selection.
- **Gold** `--gold` is for the top of the ladder and for primary actions on cobalt. Never on white.
- **Neutrals** are white work surfaces on a barely-blue canvas (`--canvas`, chroma 0.004 toward 265).
- **Tier colours** come from the enamel of the 3D emblems (steel, copper, jade, amethyst, gold) and appear only on rank UI.

## Type
- **Big Shoulders Display** (800/600): headings, rank labels, big numbers. It's condensed, athletic and scoreboard-like.
- **Archivo** (variable, width axis): everything else.
- Fluid `clamp()` sizes on brand surfaces, fixed rem sizes in the app. Numbers use tabular figures.

## Imagery
- **Tier emblems** are rendered in Blender from the same outlines as the logo mark: a lance tip (the "free lance") over rank chevrons. More chevrons and a more elaborate frame at each tier; Master is gold on cobalt enamel with a crown.
- **Portfolio work** always gets the largest area on a card, and 4:3 crops everywhere.

## Motion
- The only orchestrated sequence is the hero on first load (headline lines, then the emblem).
- Emblems float and lean toward the pointer, using transforms only.
- State changes take 160–260 ms with ease-out-quint. `prefers-reduced-motion` turns all of it off.

## Components
One button vocabulary (`.btn-primary` / `-ghost` / `-gold`, all pill-shaped) and one chip. Rank is always a `RankBadge` (emblem + label + rating), and Casual results never show one.
