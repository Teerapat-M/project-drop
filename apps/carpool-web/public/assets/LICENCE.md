# Icon sources and licences

Files in this folder (no others):

- `lucide-house.svg`, `lucide-briefcase.svg`, `LUCIDE-LICENSE.txt`
- `speech_balloon_3d.png`, `speech_balloon_3d-128.png`, `FLUENT-EMOJI-LICENSE.txt`
- `hatch_retro_3d.svg`, `hatch_retro_3d.png`
- `hatch_retro_yellow.svg`, `hatch_retro_yellow.png`
- `hatch_retro_cream.svg`, `hatch_retro_cream.png`
- `pickup_3d.svg`, `pickup_3d.png`
- `pickup_white.svg`, `pickup_white.png`
- `pickup_navy.svg`, `pickup_navy.png`
- `sedan_opt1.svg`, `sedan_opt1.png`
- `sedan_opt2.svg`, `sedan_opt2.png`
- `sedan_opt3.svg`, `sedan_opt3.png`
- `taxi_sedan.svg`, `taxi_sedan.png`
- `sedan.png`, `hatch.png`, `pickup.png` (top-down seat-map bodies)
- `LICENCE.md` (this file)

## Lucide line icons — house, briefcase
- Set: Lucide (lucide-static) v1.74.0
- Icon names: `house`, `briefcase`
- Licence: ISC
- Official SVGs fetched from:
  - https://unpkg.com/lucide-static/icons/house.svg
  - https://unpkg.com/lucide-static/icons/briefcase.svg
- Upstream licence: https://github.com/lucide-icons/lucide/blob/main/LICENSE
- Copyright: Lucide Contributors (ISC). The ISC licence text is in LUCIDE-LICENSE.txt.
- Local copies (HTML comments stripped): lucide-house.svg, lucide-briefcase.svg
- Use: 24×24 viewBox, outline, stroke-width 2, stroke-linecap/linejoin round, scaled to 16×16px on chips (20×20px on address rows). Stroke color matches the chip or row text color.

## Microsoft Fluent Emoji 3D — Speech balloon
- Assets: Speech balloon, 3D style (`speech_balloon_3d.png`, 256×256 RGBA; `speech_balloon_3d-128.png`, 128×128 RGBA)
- Licence: MIT
- Source URL: https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Speech%20balloon/3D/speech_balloon_3d.png
- Repo licence: https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
- Copyright (c) Microsoft Corporation.
- The MIT licence text is in FLUENT-EMOJI-LICENSE.txt.
- Local copies: speech_balloon_3d.png, speech_balloon_3d-128.png
- Use: image fill at 20×20px on chat icons. Kept in color on an otherwise grayscale lo-fi UI.

## Own work — hatch, pickup, sedan options, taxi
- No Fluent 3D car icons are in this folder. The cars here are original SVG drawings in one soft, line-free, Fluent-3D-like style (side/¾ view, rounded forms, gradient body, highlight, dark tyres, soft ground shadow, shared light from the upper left). They are not copies of Microsoft Fluent Emoji assets, and they copy no manufacturer logo or badge.
- Licence: original work for this project; may be reused with the project.
- Hatch: mint `hatch_retro_3d` (default), `hatch_retro_yellow` (warm yellow), `hatch_retro_cream` (cream).
- Pickup: red `pickup_3d` (default), `pickup_white` (silver-white), `pickup_navy` (navy).
- Sedan options: `sedan_opt1` silver formal notchback; `sedan_opt2` dark grey long-low coupe; `sedan_opt3` ice-blue 4-door touring fastback (app default).
- Taxi: `taxi_sedan` — recolour of the sedan style as a warm yellow taxi with an original roof lamp. No manufacturer logo, badge, or lettering.
- Sources: matching `.svg` files listed above.
- Renders: matching 256 px-wide PNGs, height cropped to the car plus about 6% margin, via cairosvg.
- Use: image fills on trip cards, pickers, switches, history, account, and taxi chrome.

## Own work — top-down seat-map bodies
- Top-down car bodies exported from the drop-friend Penpot file (boards B07 / B07h / B07p / M-B07 / M-B21). RGBA, transparent background, body only. 2× LANCZOS upscales of the native 250 px-wide export.
- `sedan.png` 500×1100 — also used for taxi (no separate taxi body).
- `hatch.png` 500×944
- `pickup.png` 500×1250
- Licence: original work for this project; may be reused with the project. No manufacturer logo or badge.
- Use: background of the join/create seat map. Seat boxes and trunk rect are overlaid from `src/lib/seat-layout.json` fractions.
