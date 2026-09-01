# Analytics exports browser QA — 2026-08-25

Result: passed. The M10-S04 report operations use the approved Hub shell/card language, are responsive and English-only, expose real queue/ready/failure/schedule states, and do not place a reusable capability in the page or URL.

## Visual evidence

| Surface             | Evidence                                                                             | Result                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop, 1512 × 982 | [analytics-exports-desktop-2026-08-25.png](analytics-exports-desktop-2026-08-25.png) | Two clear request/schedule cards, bounded status history, visible failure explanation, ready download action, automation controls, and privacy assurance fit without overflow. |
| Mobile, 390 × 844   | [analytics-exports-mobile-2026-08-25.png](analytics-exports-mobile-2026-08-25.png)   | Forms reflow to one column, controls retain full width and labels, and the page has no horizontal overflow.                                                                    |

## Interaction and accessibility evidence

- Native Chromium exercised the real React component with strict contract fixture data. The temporary public fixture route and test script were removed after capture and are not production code.
- Cadence changed from weekly to monthly and replaced the weekday selector with the day-of-month field.
- The local-hour value, request/schedule actions, one ready download action, report states, and schedule state controls were present and operable.
- Keyboard traversal produced a visible focused control. Heading, form-label, navigation, region, status, and button semantics were discoverable by role/name.
- Reduced-motion emulation disabled the processing-state spinner animation.
- Desktop and mobile checks reported `scrollWidth <= clientWidth`; the document remained English and rendered no Slovenian control or language switcher.
- Fresh pages reported zero browser warnings, console errors, or uncaught exceptions. The initial dynamic reconnaissance waited for network idle before selectors and capture.

Download authorization, private response headers, filename, strict final-document parsing, session mismatch, replay, expiry, RLS, and zero-ledger behavior are independently covered by unit/contract/pgTAP/two-session tests rather than a fixture capability.
