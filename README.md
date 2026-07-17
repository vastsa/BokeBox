<p align="center">
  <img src="docs/img/logo.svg" width="120" height="120" alt="BokeBox" />
</p>

<h1 align="center">BokeBox</h1>

<p align="center">
  <b>Drop videos in. Get podcasts out.</b><br/>
  <sub>Turn long videos into private podcasts you can actually finish — host persona, voice, and style, all yours.</sub>
</p>

<p align="center">
  <b>English</b> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/vastsa/BokeBox/"><img src="https://img.shields.io/badge/Open%20Source-GitHub-181717?style=flat-square&logo=github" alt="GitHub" /></a>
  <a href="#-30-second-pitch"><img src="https://img.shields.io/badge/AI-Spoken%20Scripts-7C5CFF?style=flat-square" alt="AI" /></a>
  <a href="#-problems-it-solves"><img src="https://img.shields.io/badge/Private-Single%20user-0EA5E9?style=flat-square" alt="Private" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-LGPL--3.0-22C55E?style=flat-square" alt="LGPL-3.0" /></a>
</p>

<p align="center">
  <a href="#-30-second-pitch">Product</a> ·
  <a href="#-who-its-for">Who it's for</a> ·
  <a href="#-ui-glimpse">UI</a> ·
  <a href="#-get-started">Get started</a>
</p>

<p align="center">
  <img src="docs/img/banner_en.webp" alt="BokeBox — Drop videos in. Get podcasts out." width="100%" />
</p>

---

## 🎧 Sound familiar?

- You saved a 2-hour tech talk / product keynote and **never found time to watch it**
- On commutes, chores, or walks, you want to learn — but your phone only offers short-video noise
- You want a show **just for yourself**, without recording into a mic at midnight
- You tried AI podcast demos: fake voices, rigid personas, and you quit after two minutes

**BokeBox is built for those moments.**

Drop a video, link, or draft into the box. It will:

1. Understand the content  
2. Rewrite it as a spoken script  
3. Speak it in the voice you choose  
4. Turn it into a private podcast you can play anytime  

---

## ⚡ 30-second pitch

```text
  What you put in                    What BokeBox gives back
 ─────────────────                  ──────────────────────
  Meeting recordings                 Rhythmic spoken episodes
  Course replays         ──AI──▶     Custom host personas
  Long-form articles                 Preset / described voices
  Any link                           Cover · flashcards · progress
```

**In one line:**  
Not another “video-to-audio” converter — a **personal AI podcast studio that belongs only to you**.

---

## ✨ Why star it

| What you care about | How BokeBox does it |
| --- | --- |
| **You can actually finish it** | Not dry subtitle reading — AI rewrites into spoken structure: open, highlights, close |
| **Sounds like a person talking** | Natural podcast voices + delivery tags (pauses, light laughs, pace shifts…) |
| **You own the persona** | Who the host is, who they talk to, style, show name — global defaults or per-episode |
| **Knowledge sticks** | Auto-extracted flashcards so key points are easy to review |
| **Your data stays yours** | Single-user private deploy; tasks and progress stay local — no public social feed |

If you believe:

> Great content deserves a second listen — told the way *you* like.

Give BokeBox a ⭐ and help more people discover private AI podcasts.

---

## 🎯 Problems it solves

### From “never finished watching” to “easy to listen through”

Long videos are dense, but they burn **eye time**.  
BokeBox turns them into **ear time**: commute, chores, bedtime — still productive.

### From “robot reading a script” to “a show with a persona”

You can set:

- How the host introduces themselves  
- PM, teacher, or friend-chat vibe  
- Show name, tone, opening/closing habits  
- Which voice to use (or describe the timbre you want)

**AI generates. You direct taste and style.**

### From “heard and forgotten” to “take flashcards with you”

Each episode ships audio plus knowledge cards and notes — one listen becomes reviewable assets.

---

## 👤 Who it's for

- **Lifelong learners**: too many courses, interviews, and keynotes — want highlights in spare time  
- **Creators / researchers**: digest source material by ear before writing or editing  
- **Solo founders / indie hackers**: fold meetings, podcasts, and essays into one personal “info radio”  
- **Privacy-minded users**: content stays on your machine, not platform algorithms  

Not a fit if you want a public podcast platform, multi-tenant SaaS, or live collaborative editing. BokeBox is intentionally small, private, and deep.

---

## 🖼 UI glimpse

Create, listen, and manage task assets in one private space.

| Home | Player |
| :---: | :---: |
| <img src="docs/img/home_en.webp" alt="BokeBox home" /> | <img src="docs/img/lis_en.webp" alt="BokeBox player" /> |

You get:

- **Home library** — finished shows and in-progress jobs at a glance  
- **One-click create** — upload video / paste link, set persona & voice  
- **Task detail** — transcript, script, audio, cover, flashcards end-to-end  
- **Immersive player** — progress memory, speed, sleep timer  

---

## 🪄 How it feels

1. **Drop it in**  
   Local video, web link, or existing draft.

2. **Tune it (optional)**  
   Keep global persona, or set this episode’s tone.

3. **Go do something else**  
   Transcribe → script → voice → cover / cards — runs in the background.

4. **Put headphones on**  
   Open the player. Feels like a show made for you.

---

## 🔌 MCP (AI-native control)

BokeBox ships with a built-in **MCP (Model Context Protocol)** endpoint. After setup, the server **auto-issues a long-lived token**.

- Protocol: `POST /mcp` (Bearer token)
- Install payload: `GET /api/mcp/install` (login required), or **Settings → MCP**
- Tools include: `create_podcast_from_url`, `create_podcast_from_text`, `list_jobs`, `get_job`, …

Cursor example:

```json
{
  "mcpServers": {
    "bokebox": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer <token from Settings → MCP>"
      }
    }
  }
}
```

Optional env `PUBLIC_BASE_URL` helps generate the correct install URL behind a reverse proxy.

## 🚀 Get started

> Three steps to ship. Deeper deploy & model notes are in the appendix.

```bash
git clone https://github.com/vastsa/BokeBox.git
cd bokebox
cp .env.example .env   # add your API keys
./start.sh             # open http://localhost:5173
```

First launch walks you through **account setup** and model config.  
After that, your first private episode is one video away.

**Docker (recommended: pull prebuilt image):**

```bash
cp .env.example .env
docker pull ghcr.io/vastsa/bokebox:latest
./start.sh docker
# open http://localhost:8787
```

**Docker (build from source locally):**

```bash
cp .env.example .env
./start.sh docker.local
```

---

## 💬 One-liner (shareable)

> BokeBox: turn videos you’ll never finish watching into private podcasts you’ll actually listen to. AI spoken scripts, custom persona & voice, data stays on your machine.

If that resonates:

1. ⭐ **Star** the repo so more people see it  
2. Open an Issue — what content do you most want “podcast-ified”?  
3. PRs welcome — UX, copy, more voices & model adapters especially  

---

## 🛤 Roadmap vibes

- Better multi-episode / “continue listening” flows  
- Richer voices and providers  
- Subscription export (e.g. RSS) into apps you already use  
- Lighter one-click desktop packaging  

Your stars, issues, and PRs are roadmap votes.

---

## ❤️ Closing note

Most tools help you **produce content faster**.  
BokeBox cares more about helping you **digest content better**.

In an age of overload, what you can finish listening to is what truly becomes yours.

**Drop videos in. Get podcasts out.**  
Add BokeBox to your toolkit — and drop a Star so more people find it.

---

<details>
<summary><b>Appendix: for people who want to deploy</b></summary>

### Requirements

- Node.js ≥ 22.5 · pnpm 9.x  
- OpenAI-compatible API (Chat / ASR / TTS; image model optional)

### Common commands

| Command | Description |
| --- | --- |
| `./start.sh` | Local dev (web 5173 + API 8787) |
| `./start.sh prod` | Build and run on a single port |
| `./start.sh docker` | Pull `ghcr.io/vastsa/bokebox:latest` and start |
| `./start.sh docker.local` | Build from local Dockerfile and start |
| `./start.sh docker:down` | Stop containers |

### Config highlights (`.env`)

```bash
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_CHAT_MODEL=mimo-v2.5
OPENAI_TRANSCRIBE_MODEL=mimo-v2.5-asr
OPENAI_TTS_MODEL=mimo-v2.5-tts
OPENAI_TTS_DEFAULT_VOICE=冰糖
```

Full variables: `.env.example`. CI/CD & image publish: [`docs/ci-cd.md`](docs/ci-cd.md).

### Pipeline (sketch)

```text
Upload → extract audio → ASR → spoken script
      → parallel: cover / flashcards / TTS → library
```

### Stack (if you ask)

React · Vite · Fastify · SQLite · ffmpeg · pnpm monorepo

### License

[LGPL-3.0](LICENSE) — open source; derivative works of the library must remain LGPL-compatible.

</details>

---

<p align="center">
  <b>BokeBox</b><br/>
  <sub>Private AI podcast box · Open Source · LGPL-3.0</sub><br/>
  <sub><a href="https://github.com/vastsa/BokeBox/">github.com/vastsa/BokeBox</a></sub>
</p>
