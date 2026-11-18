# Icon sources and licences

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
- Use in the wireframe: 24×24 viewBox, outline, stroke-width 2, stroke-linecap/linejoin round, scaled to 16×16px on chips (20×20px on B19 address rows). Stroke color matches the chip or row text color.

## Microsoft Fluent Emoji 3D — Speech balloon
- Asset: Speech balloon, 3D style (`speech_balloon_3d.png`, 256×256 RGBA)
- Licence: MIT
- Source URL: https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Speech%20balloon/3D/speech_balloon_3d.png
- Repo licence: https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
- Copyright (c) Microsoft Corporation.
- The MIT licence text is in FLUENT-EMOJI-LICENSE.txt.
- Local copy: speech_balloon_3d.png
- Use in the wireframe: image fill at 20×20px on every chat icon (slightly larger than the 16px line icons). Kept in color as requested, on an otherwise grayscale lo-fi UI.

## Microsoft Fluent Emoji 3D — car-type icons
- Set: Microsoft Fluent Emoji 3D (same set as the speech balloon)
- Licence: MIT
- Copyright (c) Microsoft Corporation.
- Repo licence: https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
- The MIT licence text is in FLUENT-EMOJI-LICENSE.txt.
- Official 3D PNGs fetched from:
  - sedan (เก๋ง 4 ประตู): https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Automobile/3D/automobile_3d.png
  - 5-door / SUV (รถ 5 ประตู): https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Sport%20utility%20vehicle/3D/sport_utility_vehicle_3d.png
  - pickup (กระบะ): https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Pickup%20truck/3D/pickup_truck_3d.png
- Local copies: automobile_3d.png, sport_utility_vehicle_3d.png, pickup_truck_3d.png
- Use in the wireframe: image fills replacing the small drawn carTypeIcon marks on trip cards, pickers, switches, history, account, and chat headers. The large top-down x-ray seat maps stay as they are.

## Own work — car-type icons (sporty fastback sedan, retro hatch, pickup)
- Decision: no free-licence 3D set was found that both (a) clearly shows a long, low mid-size sedan and a rounded retro hatch and (b) matches a soft 3D pickup. OpenMoji / Twemoji / Noto are flat 2D; Wikimedia CC0 cars were sports cars or trucks in a different style; Grab3D Cozy Cars is CC0 but isometric/game sprites, not the same soft 3D emoji look.
- These three icons are original SVG drawings in one soft, line-free, Fluent-3D-like style (side/¾ view, rounded forms, gradient body, highlight, dark tyres, soft ground shadow, shared light from the upper left). All three were redrawn as a set so they match each other. They are not copies of Microsoft Fluent Emoji assets, and they copy no manufacturer logo or badge.
- The 4-door is an original long, low mid-size sedan in the spirit of a Honda Accord: long hood, cabin set back, a sleek fastback roofline that flows into a short straight trunk deck, low ride height, wheels pushed to the corners, slim headlights. Same blue saturation family as earlier drafts (`#8EC4F8` / `#3E82D8` / `#1F4F9E`).
- Licence: original work for this wireframe; may be reused with the project. (The unused Fluent 3D reference files automobile_3d.png, sport_utility_vehicle_3d.png, and pickup_truck_3d.png remain in this folder under MIT, Copyright (c) Microsoft Corporation.)
- Sources: sedan_3d.svg, hatch_retro_3d.svg, pickup_3d.svg
- Renders: sedan_3d.png (256×134), hatch_retro_3d.png (256×236), pickup_3d.png (256×195) — 256 px wide, height cropped to the car plus about 6% margin, via cairosvg. Tight wide crops (not 256×256) so each car fills the asset width and stays large in a 26×26 card square with keepAspectRatio.
- Use in the wireframe: image fills at about 26px on trip cards and history rows, and sized to fit the B02 picker and B07 segmented switch. The large top-down x-ray seat maps are unchanged.

## Own work — sedan option studies (sedan_opt1–3)
- Three additional original SVG drawings of a 4-door mid-size sedan in the same soft, line-free, Fluent-3D-like style as `sedan_3d`, `hatch_retro_3d`, and `pickup_3d` (shared light from the upper left, gradient body, highlight, dark tyres, soft ground shadow). No manufacturer logo or badge. They are not copies of Microsoft Fluent Emoji assets.
- These are sample options for Bell to choose from; they do not replace `sedan_3d` until a choice is applied.
- Option 1: silver formal notchback (taller cabin, flatter roof, short straight trunk step).
- Option 2: dark grey long-low coupe (long hood, cabin set back, continuous slope into a tiny straight deck).
- Option 3: ice-blue 4-door touring fastback (longer greenhouse, sloping roof into a short straight deck).
- Licence: original work for this wireframe; may be reused with the project.
- Sources: sedan_opt1.svg, sedan_opt2.svg, sedan_opt3.svg
- Renders: sedan_opt1.png, sedan_opt2.png, sedan_opt3.png — 256 px wide, height cropped to the car plus about 6% margin, via cairosvg.

## Own work — hatch and pickup colour variants
- Recolours of the original `hatch_retro_3d` and `pickup_3d` drawings, in the same soft 3D style (shared light, tyres, shadow, no logos or badges). Made so a driver can pick a colour for their own car icon.
- Hatch: `hatch_retro_yellow` (warm yellow) and `hatch_retro_cream` (cream). Default remains mint `hatch_retro_3d`.
- Pickup: `pickup_white` (silver-white) and `pickup_navy` (navy). Default remains red `pickup_3d` (a Bell-approved colour exception). New pickup colours are not red.
- Licence: original work for this wireframe; may be reused with the project.
- Sources: hatch_retro_yellow.svg, hatch_retro_cream.svg, pickup_white.svg, pickup_navy.svg
- Renders: matching 256-wide PNGs, cropped with about 6% margin, via cairosvg.

## Own work — taxi sedan
- Original taxi-sedan icon in the same soft, line-free, Fluent-3D-like style as `sedan_opt3` (shared light from the upper left, gradient body, highlight, dark tyres, soft ground shadow). Recoloured as a warm yellow taxi with an original roof lamp. No manufacturer logo, badge, or lettering.
- Licence: original work for this wireframe; may be reused with the project.
- Sources: taxi_sedan.svg
- Renders: taxi_sedan.png — 256 px wide, height cropped to the car plus about 6% margin, via cairosvg.
- Use: taxi badge and taxi-trip cards on B01, and the fixed vehicle icon on taxi-share boards (B20+).
