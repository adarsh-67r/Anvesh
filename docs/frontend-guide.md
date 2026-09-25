# Anvesh — Frontend Guide

**Stack**: Next.js + TypeScript + Tailwind CSS
**Deploy**: Vercel
**Backend**: FastAPI at `http://localhost:8000` (dev), Render URL (prod)

All API calls need `Authorization: Bearer <token>` header (except login/register).

---

## Auth

Demo accounts will be seeded in the database. Just build login form.

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/api/auth/login` | POST | `{ email, password }` | `{ token, user: { id, name, email } }` |
| `/api/auth/register` | POST | `{ email, password }` | `{ token, user: { id, name, email } }` |

Store `token` in localStorage. Send as `Authorization: Bearer <token>` on all other requests.

---

## Pages

### 1. Login (`/login`)
- Email + password form
- On success → store token → redirect to `/dashboard`
- Also offer register

### 2. Dashboard (`/dashboard`)
The main hub. Show:
- **Recommended skills** — `GET /api/recommend/next` → shows top 3 skills to study with video links
- **Due flashcards count** — `GET /api/flashcards/due` → show count, link to flashcards page
- **Today's todos** — `GET /api/todos` → filter by today's date
- **Dropout risk** — `GET /api/recommend/dropout-risk` → show a subtle indicator

### 3. Learning Page (`/dashboard/learn`)
- `GET /api/recommend/next?limit=5` → list of recommended skills
- Click a skill → show its videos (`GET /api/recommend/videos/{skill_id}`)
- Embed YouTube videos (use `<iframe>` with YouTube embed URL)
- Below video: practice questions → when answered, call `POST /api/recommend/answer { skill_id, correct: true/false }`
- Show mastery progress bar per skill

### 4. Skill Graph (`/dashboard/graph`)
- `GET /api/recommend/graph` → returns all nodes with status (mastered/available/locked)
- Visualize as a tree/graph. Each node shows:
  - Label
  - Status: green (mastered), blue (available), gray (locked)
  - Mastery percentage
- Suggested library: `react-flow` or just CSS grid with connecting lines
- Click a node → go to that skill's learning page

### 5. Flashcards (`/dashboard/flashcards`)

| Action | Endpoint | Method | Body |
|--------|----------|--------|------|
| List all | `/api/flashcards` | GET | — |
| List by skill | `/api/flashcards?skill_id=X` | GET | — |
| Due for review | `/api/flashcards/due` | GET | — |
| Create | `/api/flashcards` | POST | `{ front, back, skill_id? }` |
| Update | `/api/flashcards/{id}` | PUT | `{ front?, back? }` |
| Delete | `/api/flashcards/{id}` | DELETE | — |
| Review | `/api/flashcards/{id}/review` | POST | `{ quality: 0-5 }` |

**Review flow**: Show front → user thinks → reveal back → rate 0-5:
- 0 = complete blackout
- 1 = wrong, remembered after seeing answer
- 2 = wrong, but answer felt familiar
- 3 = correct with difficulty
- 4 = correct with hesitation
- 5 = perfect, instant recall

### 6. Chat (`/dashboard/chat`)
- `POST /api/chat` with `{ message, skill_context? }` → `{ reply }`
- `GET /api/chat/history?limit=50` → past messages
- Show as a chat bubble UI
- **Voice (TTS)**: Use browser's `window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply))` to read responses aloud. Add a speaker icon button.
- Optional: add a microphone button using `webkitSpeechRecognition` for voice input

### 7. Todos (`/dashboard/todos`)

| Action | Endpoint | Method | Body |
|--------|----------|--------|------|
| List | `/api/todos` | GET | — |
| Create | `/api/todos` | POST | `{ title, due_date? }` |
| Update | `/api/todos/{id}` | PUT | `{ title?, is_done?, due_date? }` |
| Delete | `/api/todos/{id}` | DELETE | — |
| Carry forward | `/api/todos/carry-forward` | POST | — |
| Suggested | `/api/todos/suggested` | GET | — |

- Show a checklist UI
- "Suggested" section shows skill-based suggestions from the knowledge graph — user can click to add as a todo
- "Carry forward" button moves yesterday's incomplete todos to today

### 8. Timer (`/dashboard/timer`)
**100% frontend — no backend calls.**
- Pomodoro: 25 min work / 5 min break
- Use `setInterval` or `requestAnimationFrame`
- Track cumulative study time in `localStorage`:
  ```js
  // On timer complete:
  const today = new Date().toISOString().split('T')[0];
  const stored = JSON.parse(localStorage.getItem('studyTime') || '{}');
  stored[today] = (stored[today] || 0) + 25; // minutes
  localStorage.setItem('studyTime', JSON.stringify(stored));
  ```
- Show total study time today

### 9. Game (`/dashboard/game`)
- **Unlock check** (frontend): read `localStorage` study time. If today >= 60 minutes → unlock
- `GET /api/game/quiz/{skill_id}` → `{ session_id, questions: [{ idx, text, options }] }`
- User answers all questions
- `POST /api/game/submit { session_id, answers: [{ question_idx, selected }] }` → `{ score, total, percentage }`
- Show score with celebration animation
- Pick skill from a dropdown of available skills

### 10. Groups (`/dashboard/groups`)

| Action | Endpoint | Method | Body |
|--------|----------|--------|------|
| My groups | `/api/groups` | GET | — |
| Create | `/api/groups` | POST | `{ name }` |
| Join | `/api/groups/join` | POST | `{ invite_code }` |
| Share deck | `/api/groups/{id}/share-deck` | POST | `{ flashcard_ids: [] }` |
| View decks | `/api/groups/{id}/decks` | GET | — |

- Show invite code prominently (copy button)
- "Share deck" → user selects flashcards from their collection → shares to group
- Group members can view shared decks and copy cards to their own collection

### 11. Videos (`/dashboard/videos`)

| Action | Endpoint | Method | Body |
|--------|----------|--------|------|
| Get for skill | `/api/videos/{skill_id}` | GET | — |
| Add single | `/api/videos` | POST | `{ skill_id, url, title? }` |
| Add multiple | `/api/videos/bulk` | POST | `{ skill_id, urls: [] }` |
| Delete | `/api/videos/{video_id}` | DELETE | — |

- Users paste YouTube URLs → saved per skill
- Show embedded YouTube player

---

## PWA Setup

1. Create `public/manifest.json`:
```json
{
  "name": "Anvesh",
  "short_name": "Anvesh",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

2. Add a service worker (`public/sw.js`) that caches the app shell for offline access.

3. Add `<link rel="manifest" href="/manifest.json">` to the layout.

---

## API Base URL

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```
