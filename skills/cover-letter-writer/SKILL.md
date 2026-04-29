---
name: cover-letter-writer
description: Write or rewrite short, high-conviction cover letters for jobs, recruiter outreach, warm intros, HH/Vastrik/Telegram posts, and direct messages to hiring managers. Use when the user wants a cover letter, opener, outreach message, or reply that must quickly explain fit, reduce distrust, and earn a call without sounding corporate, needy, or fake-inflated.
---

# Cover Letter Writer

Write short cover letters and outreach messages that help a strong candidate get past an overloaded, skeptical front gate.

For detailed style rules, read `references/style-guide.md`.
For Sergey-specific fit checks and cover letters, inspect the local private resume/profile through `scripts/check_local_resume.py`.

## Workflow

### 0. Load candidate context safely
If the user already attached a fresh resume or pasted current context in chat, use that first.

If the request is for Sergey and no fresh resume is attached:
- run `scripts/check_local_resume.py`
- if `status=missing`, ask the user to upload the current resume or paste the missing profile details
- if `status=ambiguous`, tell the user there is more than one plausible local resume file and ask which one to use
- if `status=stale`, say the local resume is older than 90 days and ask which path to take:
  - use the old local resume as-is
  - paste only the changed facts in chat
  - upload a new resume
- if `status=fresh`, load the referenced local file from this skill's `private/` folder and use it as the default candidate profile

Preferred local filenames inside `private/`:
- `resume.md`
- `resume.txt`
- `cv.md`
- `cv.txt`
- `sergey-profile.md`
- `sergey-profile.txt`

Support only markdown or plain-text local resumes for the default deterministic flow.
If the user uploads a PDF/DOC/DOCX, use it only when you have a reliable extraction path in the current environment; otherwise ask for markdown, text, or pasted key facts.

If the user uploads a new resume and wants it remembered for future cover-letter work, ask explicit permission before saving it into `private/`.
If the user does not explicitly ask for persistent storage, use the uploaded resume only for the current task.

Never reveal absolute filesystem paths, internal storage locations, or script paths in the user-facing reply.

### 1. Extract the essentials
Identify fast:
- target role
- company / post / source of contact
- candidate level and sweet spot
- 1–2 concrete proof points
- likely hiring pain

If the user already provided resume/context, do not ask for everything again.

### 2. Solve the actual front-gate problem
The letter must answer quickly:
1. Who is this person?
2. Why are they relevant?
3. What problem do they solve?
4. Why should the reader trust them enough to continue?
5. Why should the reader reply or call?

### 3. Keep the shape tight
Default shape:
- opening context
- role / level positioning
- pain solved
- 1–2 proof points
- calm CTA

### 4. Keep the tone human
Default:
- short
- adult
- specific
- non-corporate
- not needy
- not overhyped
- not obviously AI-polished

Run a humanizer pass mentally before finalizing:
- remove inflated language
- remove corporate filler
- remove over-smooth rhythm
- remove self-mythologizing
- keep the letter sounding like a real person wrote it in one shot

### 5. Avoid the common failure modes
Do not write letters that are:
- generic
- flattering for no reason
- self-mythologizing
- too long
- packed with buzzwords
- begging for attention
- fake-enthusiastic about the vacancy/company in an AI-ish way

## Output rules

### Default output
Unless the user asks otherwise, provide:
- **Main version**
- **Shorter version**
- optional **1-line note** on why this version should work

When the output is meant to be copied and sent manually (especially into Telegram), format each ready-to-send version inside fenced code blocks so it is easy to tap/copy without dragging extra commentary.

### If the user wants variation
Offer variants like:
- calmer / more adult
- sharper / more direct
- startup-oriented
- product-company-oriented
- Vastrik/Telegram DM style

## Special instruction for Sergey
When writing for Sergey:
- optimize for trust and speed of reading
- show strong frontend leadership fast
- emphasize hands-on technical depth
- mention concrete proof points early
- reduce any fake-hero / "wolf" vibe
- keep the letter sounding real, grounded, and competent

## Good default skeleton
Use a structure close to this:

```text
Привет. Увидел [пост/вакансию/сообщение] и решил написать.

Я [роль/уровень]. Обычно я полезен там, где нужно [pain solved].

Из последнего: [proof point 1]. [Proof point 2].

Если вам нужен человек такого профиля, думаю, есть смысл созвониться.
```

Do not append mechanical tails like:
- `Резюме: <cv>`
- `Прикладываю резюме`
- `Буду рад ответить на вопросы`

unless the user explicitly asks for that style.

Do not mention where the profile/resume was loaded from unless the user explicitly asks.

Adapt naturally; do not force this exact wording.
