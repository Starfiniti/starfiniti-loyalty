# Design QA — Overview bootstrap slice

- Source visual truth: `docs/design/prototype-source/screenshots/01-overview-light.jpg`
- Implementation screenshot: `docs/design/qa/overview-implementation-912x512.png`
- Responsive evidence: `docs/design/qa/overview-implementation-mobile-390x844.png`
- Source pixels: 912 × 512
- Implementation pixels: 912 × 512
- CSS viewport: 912 × 512
- Device scale/density: browser CSS pixel capture; no density normalization required
- State: light mode, Nina & Valentin workspace, Last 30 days, two unpublished draft changes

## Full-view comparison evidence

The source and production implementation were opened together at the same crop and viewport. The final grid, 244 px sidebar, 56 px top bar, headings, three-column metrics, second-row metrics, chart header, typography, border/radius system, colors, copy, and visible state match without an actionable P0/P1/P2 difference.

## Focused-region evidence

- Header/actions: button widths and right alignment were corrected to match the source while preserving focus states and publish confirmation behavior.
- Sidebar: vertical rhythm and internal scroll behavior now match the source; the programme icon uses the source Lucide-style gem.
- Metrics: value typography was raised to the source's 26 px visual weight and card geometry matches the reference.
- Images/assets: this source screen contains no photographic or illustrative raster assets. Supplied identity initials and Lucide icons are rendered with the approved source design system; no placeholder or hand-drawn assets remain.

## Required fidelity surfaces

- Fonts and typography: Geist package, weights, sizes, line heights, tabular figures, and hierarchy match the source at the comparison viewport.
- Spacing and layout rhythm: sidebar, top bar, content inset, card grid, gaps, radii, and chart placement match.
- Colors and visual tokens: warm canvas, white surfaces, stone borders/text, indigo actions, and semantic green/amber values use the handoff tokens.
- Image quality and asset fidelity: no source raster imagery is present on this screen; icons come from the source-specified Lucide family.
- Copy/content: workspace, programme/channel/timezone, metrics, draft state, and chart labels match the approved prototype.

## Comparison history

1. Initial comparison found a P2 outer-scroll mismatch and narrower action buttons/metric typography. The sidebar was made independently scrollable, action widths were aligned, and metric values were set to 26 px. The next 912 × 512 capture removed the outer overflow and aligned the regions.
2. Responsive inspection found a P2 state bug where the hidden drawer's close button covered the hamburger. The close button is now visible only for `.sidebar-open`. Production mobile checks at 390 × 844 confirmed drawer open/close, hamburger restoration, and zero console warnings/errors.
3. Standalone packaging initially returned 404 for CSS/static chunks. Static asset preparation and exit-code-separated verification corrected the package. Final direct checks returned HTTP 200 for HTML, CSS, and JavaScript.

## Interaction and browser evidence

- Date range changed from 30 to 90 days and back.
- Publish confirmation opened and closed without publishing.
- Mobile navigation opened and closed at 390 × 844.
- Final production browser console: zero warnings or errors.

## Findings

No actionable P0, P1, or P2 fidelity findings remain for the Overview bootstrap slice.

## Follow-up polish

- P3: validate the remaining approved routes as they are implemented; this report covers only Overview.

final result: passed
