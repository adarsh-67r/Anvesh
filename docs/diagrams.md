# Anvesh — Architecture Diagrams

Render these on [mermaid.live](https://mermaid.live) and export as PNG for the PPT.

---

## 1. System Architecture

```mermaid
flowchart TB
    subgraph Client["📱 Android App"]
        FE["Dashboard • Learning • Flashcards<br/>AI Tutor • Timer • Game • Groups"]
        CACHE["Offline Flashcard Cache<br/>(syncs when online)"]
    end

    subgraph Render["☁️ Render"]
        API["FastAPI Backend"]
        subgraph RecEngine["🧠 Recommendation Engine<br/>(Production Module)"]
            KG["Knowledge Graph<br/>(DAG)"]
            ORC["Orchestrator<br/>(Auto Phase Selection)"]
            EMA["Phase 0: EMA<br/>Rule-Based Mastery"]
            BKT["Phase 1: BKT<br/>Bayesian Knowledge Tracing"]
            IRT["Phase 2: IRT<br/>Item Response Theory"]
            FUTURE["Phase 3-4: DKT / Semi-MoE<br/>(Future)"]
        end
        AUTH["Auth (JWT)"]
        CHAT["AI Tutor<br/>(voice + photo/PDF)"]
        FLASH["Flashcards (SM-2)"]
        TODOS["Smart Todos"]
        GAME["Quiz Game"]
        GROUPS["Study Groups<br/>(chat + shared files)"]
        EVENTS["Event Logger"]
    end

    subgraph External["External Services"]
        GEMINI["Google Gemini<br/>(Free Tier)"]
        SUPA["Supabase<br/>PostgreSQL"]
    end

    Client -->|REST API + JWT| API
    API --> RecEngine
    API --> AUTH
    API --> CHAT
    API --> FLASH
    API --> TODOS
    API --> GAME
    API --> GROUPS
    API --> EVENTS
    EVENTS --> RecEngine
    ORC --> EMA
    ORC --> BKT
    ORC --> IRT
    ORC -.-> FUTURE
    KG --> ORC
    CHAT -->|API Call| GEMINI
    API -->|asyncpg| SUPA

    style RecEngine stroke:#3b82f6,stroke-width:2px
    style FUTURE stroke:#9ca3af,stroke-dasharray: 5 5
    style Client stroke:#22c55e

    classDef app fill:#16a34a,stroke:#15803d,color:#fff
    classDef api fill:#0f766e,stroke:#115e59,color:#fff
    classDef svc fill:#0891b2,stroke:#0e7490,color:#fff
    classDef rec fill:#2563eb,stroke:#1d4ed8,color:#fff
    classDef orch fill:#d97706,stroke:#b45309,color:#fff
    classDef ext fill:#7c3aed,stroke:#6d28d9,color:#fff
    classDef future fill:#6b7280,stroke:#9ca3af,stroke-dasharray: 5 5,color:#fff
    class FE,CACHE app
    class API api
    class AUTH,CHAT,FLASH,TODOS,GAME,GROUPS,EVENTS svc
    class KG,EMA,BKT,IRT rec
    class ORC orch
    class GEMINI,SUPA ext
    class FUTURE future
```

---

## 2. Recommendation Engine Pipeline

```mermaid
flowchart LR
    subgraph Input["Student Interaction"]
        ANS["📝 Answer Submitted"]
    end

    subgraph Pipeline["Processing Pipeline"]
        LOG["Event Logger<br/>(Section 10 Schema)"]
        UPD["EMA Mastery Update<br/>score = 0.3×correct + 0.7×prev"]
        ORC["Orchestrator"]
    end

    subgraph Phases["Phase Selection"]
        direction TB
        CHECK{"Data Volume<br/>Check"}
        P0["Phase 0: EMA<br/>0 data needed"]
        P1["Phase 1: BKT<br/>200+ attempts/skill"]
        P2["Phase 2: IRT<br/>200+ responses/item"]
    end

    subgraph Output["Recommendation"]
        REC["Next Skills<br/>(Knowledge Graph Frontier)"]
        RISK["Dropout Risk<br/>Score"]
    end

    ANS --> LOG --> UPD --> ORC --> CHECK
    CHECK -->|"< 200 attempts"| P0
    CHECK -->|"200+ attempts"| P1
    CHECK -->|"200+ responses × 10+ users"| P2
    P0 --> REC
    P1 --> REC
    P2 --> REC
    ORC --> RISK

    style Pipeline stroke:#f59e0b
    style Phases stroke:#3b82f6
    style Output stroke:#22c55e

    classDef app fill:#16a34a,stroke:#15803d,color:#fff
    classDef api fill:#0f766e,stroke:#115e59,color:#fff
    classDef svc fill:#0891b2,stroke:#0e7490,color:#fff
    classDef rec fill:#2563eb,stroke:#1d4ed8,color:#fff
    classDef orch fill:#d97706,stroke:#b45309,color:#fff
    classDef ext fill:#7c3aed,stroke:#6d28d9,color:#fff
    classDef future fill:#6b7280,stroke:#9ca3af,stroke-dasharray: 5 5,color:#fff
    classDef out fill:#16a34a,stroke:#15803d,color:#fff
    class ANS app
    class LOG,UPD svc
    class ORC,CHECK orch
    class P0,P1,P2 rec
    class REC,RISK out
```

---

## 3. Knowledge Graph Example (8th Grade Math)

```mermaid
flowchart TD
    NUM["Number Systems"] --> FRAC["Fractions & Decimals"]
    NUM --> INT["Integers & Operations"]
    NUM --> GEO["Basic Geometry"]
    INT --> EXP["Exponents & Powers"]
    FRAC --> RAT["Ratios & Proportions"]
    INT --> ALG["Algebraic Expressions"]
    FRAC --> ALG
    GEO --> TRI["Triangles & Congruence"]
    FRAC --> DATA["Data Handling"]
    ALG --> LEQ["Linear Equations"]
    RAT --> PCT["Percentages"]
    FRAC --> PCT
    TRI --> AREA["Area & Perimeter"]
    ALG --> AREA
    TRI --> QUAD["Quadrilaterals"]
    DATA --> PROB["Probability"]
    FRAC --> PROB
    LEQ --> LINEQ["Linear Inequalities"]
    LEQ --> COORD["Coordinate Geometry"]
    GEO --> COORD
    LEQ --> POLY["Polynomials"]
    EXP --> POLY
    POLY --> QEQN["Quadratic Equations"]

    classDef mastered fill:#16a34a,stroke:#15803d,color:#fff
    classDef available fill:#2563eb,stroke:#1d4ed8,color:#fff
    classDef locked fill:#6b7280,stroke:#9ca3af,color:#fff
    class NUM,FRAC,INT mastered
    class GEO,EXP,RAT,ALG,DATA available
    class TRI,LEQ,PCT,AREA,QUAD,PROB,LINEQ,COORD,POLY,QEQN locked
```

**Legend**: 🟢 Mastered → 🔵 Available (prereqs met) → ⚪ Locked

---

## 4. Phase Evolution Timeline

```mermaid
timeline
    title Recommendation Engine Evolution
    Day 1 : Phase 0 - EMA
           : Rule-based mastery tracking
           : Knowledge graph + prerequisites
           : Zero data needed
    Month 2-3 : Phase 1 - BKT
              : Bayesian Knowledge Tracing
              : Hidden Markov Model
              : 200+ attempts per skill
    Month 4-6 : Phase 2 - IRT
              : Item Response Theory (2PL)
              : Question difficulty calibration
              : 200+ responses per item
    Year 2 : Phase 3 - DKT
           : Deep Knowledge Tracing
           : LSTM sequence model
           : 1000+ students
    Year 3 : Phase 4 - Semi-MoE
           : Mixture of Experts Transformer
           : Full personalization
           : 5000+ students
```

---

## 5. User Flow

```mermaid
flowchart LR
    LOGIN["🔑 Login"] --> DASH["📊 Dashboard"]
    DASH --> LEARN["📚 Learning<br/>Recommended Skills + Videos"]
    DASH --> CARDS["🧠 Flashcards<br/>Review (SM-2), works offline"]
    DASH --> CHAT["🤖 AI Tutor<br/>Voice, Photo & PDF Doubts"]
    DASH --> TODO["📋 Todos<br/>Smart Suggestions"]
    DASH --> TIMER["⏱️ Pomodoro Timer"]
    DASH --> GROUP["👥 Study Groups<br/>Chat + Shared Files"]

    LEARN -->|"Answer Questions"| REC["🎯 Mastery Updates<br/>+ New Recommendations"]
    TIMER -->|"60 min studied"| GAME["🎮 Quiz Game<br/>Unlocked!"]
    CARDS -->|"Due Cards"| REVIEW["📅 Spaced Review"]
    GROUP -->|"Share Decks"| CARDS

    style DASH fill:#3b82f6,color:#fff
    style REC fill:#22c55e,color:#fff
    style GAME fill:#f59e0b,color:#fff
```
