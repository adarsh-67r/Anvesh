---
name: Anvesh
description: Adaptive learning companion that knows what you should study next
colors:
  electric-indigo: "#4F46E5"
  electric-indigo-light: "#EEF2FF"
  electric-indigo-dark: "#3525CD"
  electric-sky: "#0EA5E9"
  electric-sky-light: "#E0F2FE"
  electric-sky-dark: "#0369A1"
  emerald-spring: "#10B981"
  emerald-spring-light: "#D1FAE5"
  emerald-spring-dark: "#065F46"
  signal-red: "#BA1A1A"
  signal-red-light: "#FFDAD6"
  frost-white: "#F8FAFC"
  pure-white: "#FFFFFF"
  slate-border: "#E2E8F0"
  slate-muted: "#CBD5E1"
  charcoal: "#0F172A"
  cool-slate: "#64748B"
  pale-slate: "#94A3B8"
  locked-wash: "#F1F5F9"
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: "800"
    lineHeight: 48px
    letterSpacing: -1.2px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: "700"
    lineHeight: 34px
    letterSpacing: -0.5px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: "700"
    lineHeight: 30px
    letterSpacing: -0.2px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 26px
  title:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: "600"
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 26px
  body:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: "700"
    lineHeight: 20px
    letterSpacing: 0.14px
  label:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: "700"
    lineHeight: 16px
    letterSpacing: 0.24px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: "800"
    lineHeight: 14px
    letterSpacing: 0.4px
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.electric-indigo}"
    textColor: "{colors.pure-white}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.electric-indigo-dark}"
    textColor: "{colors.pure-white}"
  button-secondary:
    backgroundColor: "{colors.electric-indigo-light}"
    textColor: "{colors.electric-indigo}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
  button-success:
    backgroundColor: "{colors.emerald-spring-light}"
    textColor: "{colors.emerald-spring-dark}"
    rounded: "{rounded.lg}"
  button-danger:
    backgroundColor: "{colors.signal-red-light}"
    textColor: "{colors.signal-red}"
    rounded: "{rounded.lg}"
  card-default:
    backgroundColor: "{colors.pure-white}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input-default:
    backgroundColor: "{colors.pure-white}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 16px"
  chip-active:
    backgroundColor: "{colors.electric-indigo}"
    textColor: "{colors.pure-white}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  chip-inactive:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.cool-slate}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
---

# Design System: Anvesh

## Overview

**Creative North Star: "The Adaptive Arena"**

Anvesh is a dynamic, responsive learning environment that visually adapts to each student's mastery state. The interface feels alive — cards shift from locked slate to active sky to mastered emerald as students progress through their knowledge graph. Every surface communicates state, and every interaction advances the learner's position in the arena.

The visual language is rooted in Android-first Material 3 sensibilities with a modern tactile minimalism: generous 48px touch targets, crisp pill badges, and state-driven chromatic cues that reward effort. The density is calibrated for high-tempo study sessions on mobile — quick scans, fast taps, immediate feedback. Decoration is absent; every visual element earns its place by communicating mastery state, prerequisite readiness, or actionable next steps.

The aesthetic avoids both the patronizing candy of children's apps and the gray austerity of enterprise dashboards. It sits in the space where gamified progression meets academic discipline — energetic enough to sustain a streak, structured enough to trust with exam prep.

**Key Characteristics:**
- State-driven color: indigo (active), sky (in-progress), emerald (mastered), slate (locked)
- Confident tactile controls with solid fills and satisfying press response
- Single typeface (Plus Jakarta Sans) across all weights for cohesive density
- Flat surfaces with 1px borders — no shadows except modals
- Progress bars and mastery percentages visible on every learning surface

## Colors

A high-chroma functional palette set against pristine low-strain neutrals. Each accent color maps to a specific learning state.

### Primary
- **Electric Indigo** (#4F46E5): The active anchor. Primary actions, quiz interactions, streak indicators, and focused study elements. Its light tint (#EEF2FF) backs secondary actions and stat badges.

### Secondary
- **Electric Sky** (#0EA5E9): Work in progress. Active study paths, in-progress mastery bars, unlocked-but-unmastered topics. Light tint (#E0F2FE) for subtle progress containers.

### Tertiary
- **Emerald Spring** (#10B981): Validated achievement. Mastered skills, correct answers, completed milestones, success confirmations. Light tint (#D1FAE5) for success-state backgrounds.

### Neutral
- **Charcoal** (#0F172A): Primary text. High contrast against frost-white surfaces.
- **Cool Slate** (#64748B): Secondary text, metadata, timestamps, labels.
- **Pale Slate** (#94A3B8): Muted text, placeholders, disabled states, tap hints.
- **Frost White** (#F8FAFC): Canvas base. Low-glare background for extended study sessions.
- **Pure White** (#FFFFFF): Elevated card surfaces, input backgrounds.
- **Slate Border** (#E2E8F0): Structural borders, progress bar tracks, dividers.
- **Locked Wash** (#F1F5F9): Locked module backgrounds, disabled surfaces.

### Named Rules
**The State Color Rule.** Every learning element communicates its state through color: indigo = actionable, sky = in progress, emerald = mastered, slate = locked. No element uses a state color for decoration.

**The Signal Red Rule.** Signal Red (#BA1A1A) is reserved exclusively for errors, incorrect answers, and destructive actions. It never appears as decoration or emphasis.

## Typography

**Display & Body Font:** Plus Jakarta Sans (with system sans-serif fallback)

**Character:** A single geometric sans-serif family deployed across all weights (400–800). The tall x-height and open apertures ensure mobile legibility in varied lighting. Heavy weights (700, 800) inject gamified punch into mastery scores and XP badges; regular weight (400) sustains comfortable reading in flashcard content and chat bubbles.

### Hierarchy
- **Display** (800, 40px, 48px line-height, -1.2px tracking): Mastery percentages, timer digits, quiz scores — the numbers that define a session.
- **Headline Large** (700, 26px, 34px line-height, -0.5px tracking): Screen titles, section headers.
- **Headline Medium** (700, 22px, 30px line-height): Card titles, modal headers, stat values.
- **Headline Small** (600, 18px, 26px line-height): Section subtitles, question text, skill labels.
- **Title** (600, 16px, 24px line-height): Card headers, nav labels, skill names in lists.
- **Body Large** (400, 16px, 26px line-height): Extended reading — flashcard content, chat messages.
- **Body** (400, 14px, 22px line-height): Default body text, descriptions, option labels.
- **Body Small** (500, 12px, 18px line-height): Metadata, timestamps, secondary info.
- **Label Large** (700, 14px, 20px line-height, +0.14px): Button text, action labels.
- **Label** (700, 12px, 16px line-height, +0.24px): Chip text, badge labels, small actions.
- **Label Small** (800, 10px, 14px line-height, +0.4px): Streak counters, XP tags, pill badges.

### Named Rules
**The Weight Ladder Rule.** Never use bold (700) or extrabold (800) for body text. Heavy weights are reserved for headlines, labels, and achievement indicators. Body text stays at 400 or 500.

## Layout

The spatial system is built on an 8px base unit with a 4px subdivision for micro-adjustments. All spacing values are multiples: xs=4, sm=8, md=16, lg=24, xl=32.

Mobile-first single-column layout with 16px horizontal margins. All interactive elements maintain a 48px minimum touch target height. Cards stack vertically with 8px gaps. Section groups separate with 16–24px vertical rhythm.

Tab navigation uses a fixed 64px bottom bar with 5 equal tabs. Content scrolls beneath fixed headers where present (chat, skill detail).

The scroll pattern is pull-to-refresh on all list screens (dashboard, skill graph, flashcards, todos, profile). Keyboard-avoiding views lift content on chat and form screens.

## Elevation & Depth

Flat by design. The system uses **tonal layering and 1px structural borders** instead of shadows. Depth is communicated through background color steps: canvas (#F8FAFC) → card (#FFFFFF with 1px #E2E8F0 border) → active state (tinted background).

No box-shadows on any surface. The only dimensional cue is the border, which separates cards from canvas without lifting them.

### Named Rules
**The No-Shadow Rule.** No element uses box-shadow. Depth is expressed through background color contrast and structural borders only. This keeps the interface fast, clean, and consistent across Android and iOS renderers.

## Shapes

Progressive roundedness: small utility elements use tight radii, larger containers use generous curves, and pills go fully round.

- **Micro elements** (badges, chips, pills): Fully round (9999px) — dynamic, playful geometry.
- **Controls** (buttons, inputs): 12px radius — approachable, tactile feel.
- **Cards & containers**: 16px radius — standard Material-aligned surface.
- **Modals & bottom sheets**: 24px top-corners for smooth docking.
- **Input borders**: 1.5px solid, transitioning from muted slate to Electric Indigo on focus.

### Named Rules
**The Pill Badge Rule.** Any element that displays a count, streak, or status tag uses fully-round pill geometry (9999px radius). This visually separates dynamic metadata from static content.

## Components

### Buttons
- **Shape:** Gently curved edges (12px radius), 48px height
- **Primary:** Electric Indigo fill, white text, label-lg weight. Press scales to 0.98 with dark indigo shift.
- **Secondary:** Indigo light tint fill, indigo text. Used for in-progress and secondary actions.
- **Success:** Emerald light fill, dark emerald text. Paired with checkmark for correct/complete states.
- **Danger:** Signal red light fill, red text. Destructive actions and incorrect state only.
- **Disabled:** Slate border fill (#E2E8F0), pale slate text, non-interactive.

### Chips
- **Active:** Electric Indigo fill, white text, fully round, 6px vertical / 14px horizontal padding.
- **Inactive:** White fill with 1px slate border, cool slate text.
- **Purpose:** Filter controls (skill graph status filters), tab-like selectors.

### Cards
- **Corner Style:** 16px radius
- **Background:** Pure white (#FFFFFF)
- **Border:** 1px solid slate border (#E2E8F0)
- **No shadow** — flat tonal layering
- **Internal Padding:** 16px (md spacing)
- **Mastered variant:** Left accent spine or top badge in Emerald Spring, subtle emerald tint border.
- **Locked variant:** Slate wash background, 50% content opacity, muted border.

### Inputs
- **Style:** 1.5px solid muted slate border, white background, 12px radius, 48px height
- **Focus:** Border shifts to Electric Indigo with subtle 3px indigo glow ring
- **Placeholder:** Pale slate (#94A3B8)

### Navigation
- **Bottom Tab Bar:** Fixed 64px height, white background, 1px top border
- **Active tab:** Electric Indigo icon + label
- **Inactive tab:** Pale slate icon + label
- **Label font:** Bold 10px (label-sm scale)

### Progress Bars
- **Track:** 8px height, slate border background (#E2E8F0), fully rounded
- **Fill:** Electric Sky for in-progress, transitioning to Emerald Spring at ≥80% mastery
- **Always fully rounded** caps on both track and fill

### Chat Bubbles
- **User:** Electric Indigo background, white text, 24px radius with 4px bottom-right corner
- **AI:** White background with 1px slate border, charcoal text, 24px radius with 4px bottom-left corner
- **Thinking state:** AI bubble with centered activity indicator

## Do's and Don'ts

### Do:
- **Do** use state colors consistently: indigo for actionable, sky for in-progress, emerald for mastered, slate for locked.
- **Do** maintain 48px minimum touch targets on all interactive elements.
- **Do** show mastery percentages and progress bars on every learning-related surface.
- **Do** use fully-round pill geometry for badges, streak counters, and status tags.
- **Do** use 1px structural borders to separate cards from canvas.

### Don't:
- **Don't** use box-shadows on any element. Depth is expressed through tonal layering only.
- **Don't** use bold or extrabold weights for body text. Reserve 700+ for headlines, labels, and achievements.
- **Don't** use state colors (indigo, sky, emerald) for pure decoration — every use must communicate learning state.
- **Don't** mix typefaces. Plus Jakarta Sans is the only font in the system.
- **Don't** use Signal Red for anything other than errors, incorrect answers, or destructive actions.
