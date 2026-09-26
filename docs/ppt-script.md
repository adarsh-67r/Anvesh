# Anvesh -- SIH 2026 Idea Presentation Script

> Template: SIH2026-IDEA-Presentation-Format.pptx
> Max 6 slides (including title). Upload as PDF.
> IMPORTANT: Use points/diagrams/infographics/pictures -- avoid paragraphs. Keep precise and easy to understand.

---

## Slide 1 -- Title Page

| Field | Value |
|-------|-------|
| Problem Statement ID | 26207 |
| Problem Statement Title | Smart Education |
| Theme | Smart Education |
| PS Category | Software |
| Team ID | [FILL IN] |
| Team Name | [FILL IN] |

Tagline: "An adaptive learning platform that evolves with every student"

---

## Slide 2 -- Proposed Solution: ANVESH

**Title**: ANVESH -- Adaptive Neural-Powered Versatile Education & Study Hub

**What is the problem?**
- India's education system serves 250M+ students with one-size-fits-all teaching -- students either fall behind or aren't challenged enough
- 30%+ students disengage before completing a topic because content difficulty doesn't match their level (ASER 2023)
- Existing EdTech platforms recommend content based on grade, not individual mastery -- a Class 8 student struggling with fractions gets the same content as one ready for algebra

**Our Solution:**

**[1] Adaptive Recommendation Engine** (THE CORE DIFFERENTIATOR)
- Builds a Knowledge Graph (prerequisite tree of skills) for each subject
- Tracks individual mastery using Exponential Moving Average (EMA) -- works from day 1 with zero prior data
- Auto-upgrades to Bayesian Knowledge Tracing (BKT) and Item Response Theory (IRT) as data accumulates
- Roadmap extends to Deep Knowledge Tracing (LSTM) and Semi-MoE Transformer at scale
- No cold-start problem -- the system is useful from the very first student

**[2] AI Tutor Chatbot** -- Google Gemini-powered, context-aware (knows the student's current topic), with voice output via browser TTS. Students can ask doubts at any time, in natural language.

**[3] Spaced Repetition Flashcards** -- SM-2 algorithm (used by 10M+ Anki users worldwide) schedules reviews at mathematically optimal intervals. Proven to increase retention by 200%+.

**[4] Smart To-Do List** -- auto-suggests study tasks based on knowledge graph gaps ("You should study Linear Equations next -- you've mastered the prerequisites"). Carries forward incomplete tasks.

**[5] Gamification** -- quiz games unlock after 1 hour of focused study (Pomodoro timer tracked). Transforms learning into a reward cycle.

**[6] Study Groups** -- join with invite codes, share flashcard decks, see peers' progress. Builds accountability and peer learning.

**[7] PWA / Offline** -- works on slow connections, cached flashcard review offline. Reaches rural and underserved students.

---

## Slide 3 -- Technical Approach

**Include 2 diagrams: System Architecture + Recommendation Pipeline**

### Key Technical Points (bullets below diagrams):

- **SkillStateProvider Interface**: A single API contract (get_mastery, get_recommendations, get_dropout_risk) that stays identical from Phase 0 to Phase 4. Callers never change -- only the underlying algorithm does.
- **Event Logging Pipeline**: Every student interaction (answers, video watches, hints, time spent) is recorded in a structured schema from Day 1. This is the training data that enables BKT, IRT, DKT progression.
- **Knowledge Graph as DAG**: Skills modeled as a directed acyclic graph with prerequisite edges. The system always recommends the deepest skill whose prerequisites are mastered -- optimal learning path.
- **EMA Formula**: mastery(t) = 0.3 x correct(t) + 0.7 x mastery(t-1). Mastery declared at >=0.75 for 3 consecutive attempts. Simple, interpretable, zero-data.

---

## Slide 4 -- Feasibility & Viability

### WHY THIS WORKS

**Zero cold-start problem**
Phase 0 (EMA + Knowledge Graph) needs no historical data. Works from the first student, first session. Most ML-based EdTech tools fail here -- they need thousands of students before they can recommend anything useful.

**Zero cost deployment**
Entire production stack on free tiers:
- Supabase (PostgreSQL) -- 500MB, 50K rows free
- Render (FastAPI backend) -- 750 hours/month free
- Vercel (Next.js frontend) -- unlimited deploys free

**Production-grade module**
The recommendation engine isn't a hackathon prototype -- it's designed as a standalone microservice with a stable interface. Already on the production roadmap of ARiTHi Education Technology (our EdTech startup).

**Research-backed algorithms**
Every algorithm uses peer-reviewed defaults:
- EMA mastery tracking (exponential smoothing, standard in learning analytics)
- BKT (Corbett & Anderson 1995 -- 4000+ citations)
- IRT 2PL (Embretson & Reise 2000 -- foundational psychometrics)
- SM-2 (used by 10M+ Anki users)

### CHALLENGES & MITIGATION

| Challenge | Risk | Mitigation |
|-----------|------|------------|
| Not enough data for ML phases | Medium | Progressive activation -- system works on rules until data accumulates naturally |
| Content depends on YouTube | Low | User-contributed model -- students/teachers paste their own video links |
| Model accuracy with limited data | Medium | Conservative defaults from literature. Graceful fallback -- BKT falls back to EMA |
| Student engagement drop-off | Medium | Gamification, spaced repetition, study groups, AI chatbot for instant help |
| Scalability under load | Low | Stateless REST API, async Python (FastAPI), connection pooling, horizontal scaling |
| Privacy & data security | Low | JWT auth, no PII in event logs, database encryption on Supabase, consent flags |

---

## Slide 5 -- Impact & Benefits

### FOR STUDENTS
- **Personalized learning paths** -- every student gets a unique skill sequence based on actual mastery, not grade or age
- **200%+ better retention** -- SM-2 spaced repetition optimizes review timing. Students remember more by studying less (at the right time)
- **Learning becomes rewarding** -- gamified quizzes unlock after focused study sessions. Pomodoro timer builds discipline
- **24/7 AI tutor** -- stuck at 11 PM before an exam? Gemini-powered chatbot knows your current topic and explains at your level
- **Works anywhere** -- PWA runs offline, flashcard review works without internet. Reaches rural students

### FOR TEACHERS
- **Class-wide mastery dashboards** -- event logging shows which skills an entire class struggles with
- **Early dropout detection** -- dropout risk scoring flags at-risk students before they disengage
- **Content contribution** -- teachers paste YouTube playlists per skill, curating resources without building content

### FOR THE ECOSYSTEM
- **Pluggable into existing platforms** -- recommendation engine is a standalone Python microservice, integrable via HTTP API
- **Scales with data automatically** -- starts simple, becomes sophisticated. No "v2 rewrite" needed
- **Aligned with NEP 2020** -- personalized, competency-based learning paths align with India's National Education Policy goals

**Scale potential**: The platform can serve 250M+ Indian students across any subject. The knowledge graph is subject-agnostic -- math today, science tomorrow, coding next.

---

## Slide 6 -- Research & References

1. **Corbett, A. T., & Anderson, J. R. (1995)**. Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge. User Modeling and User-Adapted Interaction, 4(4), 253-278.
   -- Foundation of our BKT implementation. 4000+ citations.

2. **Embretson, S. E., & Reise, S. P. (2000)**. Item Response Theory for Psychologists. Lawrence Erlbaum Associates.
   -- Our IRT 2PL model for question difficulty calibration.

3. **Piech, C., et al. (2015)**. Deep Knowledge Tracing. Advances in Neural Information Processing Systems (NeurIPS).
   -- Future Phase 3: LSTM-based knowledge tracing at scale.

4. **Wozniak, P. A., & Gorzelanczyk, E. J. (1994)**. Optimization of repetition spacing in the practice of learning. Acta Neurobiologiae Experimentalis, 54, 59-62.
   -- SM-2 algorithm powering our flashcard system. Used by 10M+ Anki users.

5. **Shazeer, N., et al. (2017)**. Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer. ICLR 2017.
   -- Inspiration for our Phase 4 Semi-MoE Transformer architecture.

6. **ASER Centre (2023)**. Annual Status of Education Report.
   -- Evidence for the learning gap problem in Indian education.

7. **National Education Policy 2020**, Ministry of Education, Government of India.
   -- Policy alignment: competency-based, personalized learning.
