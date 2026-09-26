# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Students of any age, primarily targeted at secondary/higher-secondary students for the AICTE hackathon. Used on personal mobile devices for self-directed study sessions — reviewing material, practicing problems, tracking mastery, and collaborating with peers.

## Product Purpose

Anvesh is an adaptive learning companion that combines a recommendation engine with a unified study toolkit. It helps students know _what_ to study next based on their demonstrated mastery, then gives them the tools to study it — flashcards, video lessons, quiz games, AI tutoring, and group collaboration — without switching between apps. Success means measurably improving skill mastery through personalized learning paths.

## Positioning

The core differentiator is a multi-model adaptive recommendation engine (Bayesian Knowledge Tracing, Item Response Theory, Exponential Moving Average) over a prerequisite knowledge graph. Unlike static content libraries, Anvesh models each student's mastery per-skill and recommends the optimal next topic based on prerequisite readiness, mastery gaps, and dropout risk. The unified toolkit (flashcards with SM-2 spaced repetition, quiz games, AI tutor, study groups, pomodoro timer) means students act on recommendations immediately without context-switching.

## Operating Context

Students open the app during study sessions — before exams, between classes, or in focused pomodoro blocks. They follow recommended skills, watch linked videos, practice with adaptive questions, review flashcards on spaced schedules, and occasionally collaborate through study groups with shared decks. The AI tutor provides on-demand concept explanations tied to the current study topic.

## Capabilities and Constraints

**Capabilities:**

- Knowledge graph with prerequisite-based skill unlocking (mastered → available → locked)
- Adaptive mastery scoring with BKT, IRT, and EMA models
- Dropout risk prediction
- Flashcards with SM-2 spaced repetition algorithm
- Quiz game with scoring and XP
- AI tutor (Gemini-powered) with conversation history
- Study groups with invite codes and shared flashcard decks
- Todo management with carry-forward and AI-suggested tasks
- Pomodoro timer (25/5/15 cycle)

**Constraints:**

- Backend is FastAPI + PostgreSQL; knowledge graph loaded from static JSON
- AI tutor requires Gemini API key server-side
- No offline mode — requires network connectivity
- Recommendation module is designed to transplant to Arithi's production platform post-hackathon

## Brand Commitments

Name: **Anvesh** (meaning "exploration" / "quest for knowledge" in Sanskrit)
Built by: ARiTHi
Font: Plus Jakarta Sans (all weights)
Primary color: #4F46E5 (Electric Indigo)

## Evidence on Hand

- Complete backend API (FastAPI) with all endpoints functional
- Knowledge graph data (JSON) with skills, prerequisites, and quiz questions
- Stitch design mockups for all 10 screens (Login, Dashboard, Learning Page, Skill Graph, Flashcards, Todos, Study Groups, Quiz Game, AI Chat, Pomodoro Timer)
- No real student usage data yet; seed data available for demo

## Product Principles

1. **Adaptive over static** — Every interaction informs the mastery model; the app gets smarter about what each student needs.
2. **Unified over fragmented** — One app replaces the study toolkit stack; recommendations flow directly into action.
3. **Progress is visible** — Mastery percentages, streaks, XP, and prerequisite unlocks make learning progress tangible and motivating.
4. **Demo-ready fidelity** — Hackathon submission demands a polished, working product that demonstrates the recommendation engine's value convincingly.
