# Anvesh — Architecture Diagrams

Render these on [mermaid.live](https://mermaid.live) and export as PNG for the PPT.

---

## 1. System Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client (Browser / PWA)"]
        FE["Next.js Frontend<br/>Dashboard • Learning • Flashcards<br/>Chat • Timer • Game • Groups"]
    end

    subgraph Vercel["☁️ Vercel"]
        FE
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
        CHAT["Chatbot"]
        FLASH["Flashcards (SM-2)"]
        TODOS["Smart Todos"]
        GAME["Quiz Game"]
        GROUPS["Study Groups"]
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
    ORC --> EMA
    ORC --> BKT
    ORC --> IRT
    ORC -.-> FUTURE
    KG --> ORC
    CHAT -->|API Call| GEMINI
    API -->|asyncpg| SUPA

    style RecEngine fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style FUTURE fill:#f3f4f6,stroke:#9ca3af,stroke-dasharray: 5 5
    style Client fill:#f0fdf4,stroke:#22c55e
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

    style Pipeline fill:#fef3c7,stroke:#f59e0b
    style Phases fill:#dbeafe,stroke:#3b82f6
    style Output fill:#dcfce7,stroke:#22c55e
```

---

## 3. Knowledge Graph Example (8th Grade Math)

```mermaid
flowchart TD
    NUM["🔢 Number Systems<br/>Depth 0"]
    FRAC["➗ Fractions & Decimals<br/>Depth 1"]
    INT["± Integers & Operations<br/>Depth 1"]
    GEO["📐 Basic Geometry<br/>Depth 1"]
    EXP["🔋 Exponents & Powers<br/>Depth 2"]
    RAT["⚖️ Ratios & Proportions<br/>Depth 2"]
    ALG["🔤 Algebraic Expressions<br/>Depth 2"]
    TRI["△ Triangles<br/>Depth 2"]
    DATA["📊 Data Handling<br/>Depth 2"]
    LEQ["📈 Linear Equations<br/>Depth 3"]
    PCT["% Percentages<br/>Depth 3"]
    AREA["📏 Area & Perimeter<br/>Depth 3"]
    QUAD["◇ Quadrilaterals<br/>Depth 3"]
    PROB["🎲 Probability<br/>Depth 3"]
    LINEQ["≤ Linear Inequalities<br/>Depth 4"]
    COORD["📍 Coordinate Geometry<br/>Depth 4"]
    POLY["📐 Polynomials<br/>Depth 4"]
    QEQN["x² Quadratic Equations<br/>Depth 5"]

    NUM --> FRAC
    NUM --> INT
    NUM --> GEO
    INT --> EXP
    FRAC --> RAT
    INT --> ALG
    FRAC --> ALG
    GEO --> TRI
    FRAC --> DATA
    ALG --> LEQ
    RAT --> PCT
    FRAC --> PCT
    TRI --> AREA
    ALG --> AREA
    TRI --> QUAD
    DATA --> PROB
    FRAC --> PROB
    LEQ --> LINEQ
    LEQ --> COORD
    GEO --> COORD
    LEQ --> POLY
    EXP --> POLY
    POLY --> QEQN

    style NUM fill:#22c55e,color:#fff
    style FRAC fill:#22c55e,color:#fff
    style INT fill:#22c55e,color:#fff
    style GEO fill:#3b82f6,color:#fff
    style ALG fill:#3b82f6,color:#fff
    style EXP fill:#9ca3af,color:#fff
    style RAT fill:#9ca3af,color:#fff
    style TRI fill:#9ca3af,color:#fff
    style DATA fill:#9ca3af,color:#fff
    style LEQ fill:#9ca3af,color:#fff
    style PCT fill:#9ca3af,color:#fff
    style AREA fill:#9ca3af,color:#fff
    style QUAD fill:#9ca3af,color:#fff
    style PROB fill:#9ca3af,color:#fff
    style LINEQ fill:#9ca3af,color:#fff
    style COORD fill:#9ca3af,color:#fff
    style POLY fill:#9ca3af,color:#fff
    style QEQN fill:#9ca3af,color:#fff
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
    DASH --> CARDS["🧠 Flashcards<br/>Create & Review (SM-2)"]
    DASH --> CHAT["🤖 AI Chat<br/>Ask Doubts + Voice"]
    DASH --> TODO["📋 Todos<br/>Smart Suggestions"]
    DASH --> TIMER["⏱️ Pomodoro Timer"]
    DASH --> GROUP["👥 Study Groups"]

    LEARN -->|"Answer Questions"| REC["🎯 Mastery Updates<br/>+ New Recommendations"]
    TIMER -->|"60 min studied"| GAME["🎮 Quiz Game<br/>Unlocked!"]
    CARDS -->|"Due Cards"| REVIEW["📅 Spaced Review"]
    GROUP -->|"Share Decks"| CARDS

    style DASH fill:#3b82f6,color:#fff
    style REC fill:#22c55e,color:#fff
    style GAME fill:#f59e0b,color:#fff
```
