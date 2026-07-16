# UI design reference

The three PNG files in this folder are implementation references generated from the frozen v0.3 product specification.

## Visual system

- Primary environment: iPhone Safari, 390 x 844 portrait.
- Background: true white (`#ffffff`).
- Primary text: deep navy (`#10224b`).
- Divider and quiet surfaces: cool gray (`#d9dee8`, `#f6f8fb`).
- Primary action and selected price: amber (`#f2a100`).
- Availability and success: teal (`#149a9a`).
- Container model: open lists and section dividers, with cards only for a purposeful grouped surface.
- Typography: system Japanese sans serif, strong numeric hierarchy, 16px or larger form controls.
- Controls: 44px minimum touch target, restrained two-pixel outline icons, visible focus and pressed states.
- Motion: short opacity/translate feedback only; reduced-motion users get no nonessential motion.

## Component families

- Quiet app header with one back or refresh action.
- Six large pattern buttons grouped by weekday and weekend/holiday.
- Price-ranked result rows with name, price, walking time, payment, availability, and recommendation label.
- Open detail sections separated by dividers.
- Long single-page form with persistent labels and a safe-area-aware save action.
- Inline success/error notices near the action that caused them.

## Source concepts

- `home-mobile-concept.png`: pattern selection and ranked list.
- `detail-mobile-concept.png`: parking detail and history/actions.
- `form-mobile-concept.png`: add/edit form.

Generated text inside the PNGs is visual reference only. The v0.3 specification and code-native Japanese copy are authoritative.
