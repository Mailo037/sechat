# Project UI Rules

## Core Rules

- Use local custom UI primitives from `src/components/ui` for buttons, inputs, modals, selects, switches, tooltips, and related controls.
- Do not use native browser `title` tooltips for app UI. Use the local `Tooltip` component or the app's custom tooltip styling.
- Keep copied UI primitives local to this app and adapt them to the app's existing dependencies instead of adding parallel icon/UI stacks.
- Match the chat app's minimal black/gray visual language for new controls and action feedback.

## Design Source Of Truth

- Read `DESIGN.md` before changing app UI, especially menus, popovers, modals, top controls, message actions, composer-adjacent UI, or any new floating surface.
- Treat `DESIGN.md` as the visual contract for this app. If code and memory disagree, inspect the current UI and update the implementation to match the documented direction.
- Keep `DESIGN.md` and this file aligned when adding a new reusable UI pattern.
- Do not introduce a new visual language for one feature. Extend the existing Sechat language.

## Composer Standard

- Treat the composer as the strongest visual reference: keep its dark matte surfaces, pill controls, subtle borders, compact spacing, and soft bottom fade intact.
- Do not restyle the composer unless the user explicitly asks for composer changes.
- Composer-adjacent UI should inherit the composer rhythm: compact height, pill actions, matte gray surfaces, subtle inset highlights, and short tactile transitions.
- Preserve the bottom fade and safe-area padding around the composer.
- Use the bright send-ready treatment only for clear primary actions. Do not scatter bright white CTAs through secondary UI.
- Attachment, reply, voice, and mention UI should feel like extensions of the composer, not separate cards.

## Top Menus And Floating Panels

- When adding or changing menus opened from the top buttons, preserve the current Top-Chrome family: left room pill, right dock buttons, compact glassy panels, short labels, Phosphor icons, and responsive `100dvh` bounds.
- Top button menus should anchor near their trigger and open around `48px` to `54px` from the top chrome.
- The right dock remains a small pill cluster of icon buttons. Avoid adding text labels directly into the dock.
- Room overview stays left-anchored from the room pill and should use compact status grids or chips.
- More/options menus should use a small head, up to two larger action tiles, then compact rows.
- Settings panels should use `panel-head`, a title with icon, a close button, and scan-friendly setting rows.
- Prefer small, scan-friendly panels over large explanatory cards. Use larger modals only when a compact panel would become too long.
- Full modals should still look like expanded panels, not standalone settings pages.

## Surfaces And Color

- Keep surfaces in the app's black/gray palette: near-black page, dark gray panels, light gray text, muted gray secondary text.
- Use borders around `rgba(82, 82, 91, ...)` and subtle inset highlights instead of heavy outlines.
- Use `var(--shadow-soft)` or `var(--shadow-tight)` for floating surfaces.
- Use blur only as a restrained glass effect behind panels. Avoid glow, bokeh, colorful gradients, or decorative blobs.
- Rounded shape rules: pills for docks and icon actions, 16px to 20px for popovers, larger radius only for full modals.
- Keep accent color usage rare and purposeful. Danger states may use red, reply accents may keep their current pink treatment, but normal navigation stays gray.

## Components And Icons

- Use Phosphor icons because the app already depends on `@phosphor-icons/react`.
- Do not add lucide, heroicons, radix-icons, or another icon stack unless the user explicitly asks and there is a strong reason.
- Do not hand-roll SVG icons for app controls when a Phosphor icon exists.
- Use `Button` from `src/components/ui/button.tsx` for standard button behavior, then style with existing app classes.
- Use `Modal` from `src/components/ui/modal.tsx` for modal behavior and focus trapping.
- Use `Switch`, `Input`, `Textarea`, `Select`, and `Tooltip` from `src/components/ui` rather than native-only controls when the UI is part of the app.
- Keep copied UI primitives local and adapted to the app's dependencies. Do not paste in a parallel shadcn or Radix component tree.

## Tooltips And Accessibility

- Never use native browser `title` attributes for app UI. Replace them with `Tooltip`, `TooltipLayer`, or `data-tooltip`.
- Icon-only buttons need an `aria-label`.
- Buttons that open panels need `aria-expanded`.
- Menus and dialogs need clear accessible labels.
- Close buttons should be icon-only with an `aria-label` and tooltip.
- Keep focus states visible and consistent with the local button primitive.
- Keyboard and screen reader behavior matter for floating UI: Escape should close modals, focus should not disappear, and disabled controls should be announced as disabled.
- If touching existing media/GIF UI, replace any remaining native `title` usage with the local tooltip pattern.

## Layout And Responsiveness

- Use responsive widths like `min(..., calc(100vw - ...))` for floating panels.
- Bound scrollable panels with `max-height` based on `100dvh`.
- Account for `env(safe-area-inset-top)` in top chrome and `env(safe-area-inset-bottom)` near the composer.
- Text inside buttons, status chips, and compact rows should not wrap awkwardly. Use ellipsis or shorter labels.
- Long names, URLs, file names, and device names need truncation or `overflow-wrap: anywhere`.
- Mobile panels should remain reachable and should not cover the composer in a way that blocks core chat input unless they are modal.

## Motion And Feedback

- Keep animations short and functional. Popovers should use opacity, a small y offset, and slight scale.
- Use `useReducedMotion` or CSS `prefers-reduced-motion` handling for new motion.
- Hover and active states should feel tactile: tiny translate, subtle background change, or icon pop.
- Avoid decorative looping motion except for genuine voice activity, loading, recording, or speaking states.
- Add visible loading, disabled, success, and error states for new controls.

## Content Style

- Keep UI copy short and useful. Menus are for actions, not explanations.
- Use direct labels such as `Profile`, `Alerts`, `Trusted sites`, `Clear cache`, `More settings`.
- Put secondary detail in small muted text, not full paragraphs.
- Avoid marketing copy, hero language, onboarding-style feature descriptions, or generic SaaS phrasing inside app controls.
- Keep status text compact: examples are `3/3 sounds on`, `Muted`, `Reload`, `Live`, `Local`.

## Implementation Workflow

- Before editing UI, inspect the relevant existing component and CSS class family.
- Prefer extending existing class families such as composer, header-menu, control-panel, admin-modal, settings-row, message-action-menu, and voice-device-menu.
- Keep edits scoped. Do not refactor unrelated chat, Firebase, or moderation logic while making design changes.
- Do not change data contracts, analytics-relevant labels, or storage behavior for a visual-only request.
- Preserve user changes already present in the worktree.
- If the requested UI change conflicts with `DESIGN.md`, favor `DESIGN.md` and note the conflict.

## Verification

- For UI changes, run the app and inspect the affected surface in a real browser when feasible.
- Check the relevant top-button menus after changing shared panel styles.
- Check composer layout after changing bottom spacing, message scroll, attachments, reply preview, voice recording, or text area styles.
- Check mobile width for floating panels and the composer.
- Run the repo's available validation when appropriate: `npm run build` for type/build safety and `npm run lint` if the change touches TypeScript or JSX.
- Documentation-only changes do not require a build unless they also alter code.
