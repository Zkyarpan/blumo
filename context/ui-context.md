# Blumo — UI Context

## Brand

### Name

**Blumo**

### Pronunciation

**Bloo-mo**

### Meaning

Inspired by blooming and steady growth. Blumo represents becoming a better developer through small, repeated actions.

### Primary Tagline

**Grow every day.**

### Brand Personality

- Encouraging, not childish.
- Calm, not gamified chaos.
- Professional enough for a portfolio and career product.
- Friendly enough for beginners.
- Clear, honest, and progress-focused.
- Modern developer-tool quality without looking cold.

## Theme

The MVP is light-first with an optional system dark mode added only after the complete core flow is stable. The visual language uses warm white backgrounds, subtle green-tinted surfaces, dark forest text, generous whitespace, rounded panels, and restrained growth-inspired accents.

The interface should feel like a supportive developer workspace, not a social network or arcade.

## Color Tokens

All application components use semantic tokens. Do not place raw hex values directly in feature components.

| Role | CSS Variable | Value |
|---|---|---|
| Page background | `--bg-base` | `#F7FAF8` |
| Primary surface | `--bg-surface` | `#FFFFFF` |
| Subtle surface | `--bg-subtle` | `#EEF6F0` |
| Elevated surface | `--bg-elevated` | `#FFFFFF` |
| Primary text | `--text-primary` | `#132018` |
| Secondary text | `--text-secondary` | `#3F5A49` |
| Muted text | `--text-muted` | `#6B7D71` |
| Inverse text | `--text-inverse` | `#FFFFFF` |
| Primary accent | `--accent-primary` | `#2E9D5B` |
| Primary hover | `--accent-primary-hover` | `#247E49` |
| Accent soft | `--accent-soft` | `#DCF5E5` |
| Accent strong | `--accent-strong` | `#16683A` |
| Default border | `--border-default` | `#D9E5DC` |
| Strong border | `--border-strong` | `#B9CCBE` |
| Focus ring | `--focus-ring` | `#69C58D` |
| Success | `--state-success` | `#168A4A` |
| Success soft | `--state-success-soft` | `#DDF5E7` |
| Warning | `--state-warning` | `#B96B12` |
| Warning soft | `--state-warning-soft` | `#FFF0D8` |
| Error | `--state-error` | `#C43D47` |
| Error soft | `--state-error-soft` | `#FCE4E7` |
| Info | `--state-info` | `#2563A6` |
| Info soft | `--state-info-soft` | `#E4EFFB` |
| Code background | `--code-bg` | `#102017` |
| Code text | `--code-text` | `#DDF5E7` |

## Typography

| Role | Font | Variable |
|---|---|---|
| UI and headings | Geist Sans | `--font-sans` |
| Code and identifiers | Geist Mono | `--font-mono` |

### Type Scale

- Hero: `text-4xl md:text-6xl`, semibold, tight tracking.
- Page title: `text-2xl md:text-3xl`, semibold.
- Section title: `text-xl`, semibold.
- Card title: `text-base`, semibold.
- Body: `text-sm md:text-base`, normal.
- Supporting text: `text-sm`, muted.
- Label: `text-sm`, medium.
- Metadata: `text-xs`, muted.

Avoid oversized text inside the authenticated application.

## Border Radius

| Context | Class |
|---|---|
| Badges and compact controls | `rounded-md` |
| Inputs and buttons | `rounded-lg` |
| Cards and panels | `rounded-xl` |
| Dialogs and major overlays | `rounded-2xl` |
| Avatar | `rounded-full` |

Do not use fully pill-shaped buttons by default.

## Shadows

Use shadows sparingly:

- Cards: border first; subtle shadow only when elevated.
- Dialogs: medium shadow.
- Navigation: border separator rather than heavy shadow.
- Do not place strong shadows on every element.

## Component Library

Use shadcn/ui on top of Tailwind CSS.

Rules:

- Add components with the shadcn CLI.
- Generated primitives live in `src/components/ui/`.
- Do not directly rewrite generated primitives for one feature.
- Build Blumo-specific wrappers in `src/components/shared/`.
- Use Radix behaviours provided through shadcn for dialogs, menus, tooltips, and accessible controls.

Initial components:

```text
button
card
input
label
select
textarea
dialog
dropdown-menu
tabs
badge
avatar
separator
sheet
tooltip
sonner
skeleton
progress
```

## Icons

Use Lucide React only.

Sizes:

- Inline metadata: `size-4`.
- Buttons: `size-4`.
- Navigation: `size-5`.
- Empty states: `size-8` to `size-10`.

Use an icon only when it improves recognition. Do not decorate every heading.

## Main Layout Patterns

### Marketing Site

- Sticky top navigation.
- Maximum content width around `1200px`.
- Spacious hero with a clear single action.
- Product explanation in three simple steps.
- Real interface examples rather than abstract AI graphics.
- Responsive single-column stacking on mobile.

### Authenticated Application

Desktop:

```text
Left navigation
Main content
Optional contextual right panel only where needed
```

Mobile:

```text
Top bar
Sheet navigation
Single-column content
Sticky primary action where appropriate
```

### Dashboard

- Welcome and current goal.
- Today's mission card as the main visual priority.
- Small progress summary.
- Connected repository status.
- Recent activity list.
- Avoid crowded analytics.

### Onboarding

- One focused question per step or a short grouped form.
- Visible progress indicator.
- Clear Back and Continue controls.
- Save on final confirmation.
- Explain why each piece of information is requested.

### Task Workspace

Desktop:

```text
Task instructions | Markdown editor and preview
```

Mobile:

```text
Instructions
Editor
Preview tab
Commit review
```

The approval action must not be visually mixed with regeneration or secondary controls.

### Commit Review

Display in one review panel:

- Repository.
- Branch.
- File path.
- Commit message.
- Full content preview.
- Safety notice.
- Approve and commit button.

Use a confirmation dialog only when it adds clarity, not as a substitute for the review page.

## States

Every data-driven feature includes:

- Loading state.
- Empty state.
- Error state.
- Success state.
- Disabled state.
- Reconnection state where external access is missing.

Error messages explain the next action in plain language.

## Motion

- Use short opacity and position transitions.
- Use Framer Motion only when CSS transitions are insufficient.
- No continuous decorative animations in the dashboard.
- Respect reduced-motion preferences.
- Success celebration should be subtle and finish quickly.

## Accessibility

- Keyboard-accessible controls.
- Visible focus indicators.
- Proper labels and descriptions.
- Sufficient contrast.
- No colour-only status communication.
- Minimum comfortable touch target.
- Dialog focus management.
- Descriptive link text.
- Markdown preview content uses semantic headings.
