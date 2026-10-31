# AudioBot — Product Overview

*A plain-language guide to what this product does, who it is for, and everything
it can do. Written for a non-technical reader: a client, a hiring manager, or an
investor. No engineering knowledge assumed.*

---

## The short version

AudioBot is an AI interviewer that holds a real conversation.

A candidate opens a link in their browser and talks to it out loud, the same way
they would talk to a person on a video call. It listens, understands, and asks a
genuine follow-up question based on what they just said. It knows the job they
applied for and it has read their résumé, so the questions are specific to them
rather than pulled from a list. When it has learned enough, it ends the interview
on its own and produces a written, scored report with a hiring recommendation.

A first-round screening interview that takes a recruiter 30 to 45 minutes of
their day happens without them, at any hour, for any number of candidates at
once, and arrives on their desk as a structured report.

---

## The problem it solves

First-round screening is the most expensive and least rewarding part of hiring.

A recruiter filling one role might screen 50 candidates to shortlist 8. Each
screen is a half-hour call, plus scheduling, plus writing up notes. That is
roughly 30 to 40 hours of skilled time spent mostly confirming that people are
*not* a fit. The work is repetitive, it does not scale, and it is the first thing
to be rushed when the pipeline gets busy.

The consequences compound:

- **Good candidates wait.** Scheduling a first call takes days. The best people
  have other offers moving faster.
- **Quality drifts.** The twelfth interview of the week is not as careful as the
  first. Tired interviewers ask shallower questions.
- **Notes are inconsistent.** Two recruiters screening the same candidate write
  up different things, and neither set of notes compares cleanly against anyone
  else's.
- **Decisions are hard to defend.** When a rejection is questioned, there is
  often nothing to point at but a few lines of handwriting.
- **Nobody gets feedback.** Rejected candidates hear nothing, because writing
  useful feedback for 42 people is not something anyone has time for.

AudioBot addresses all of this at once: it runs the screen, it runs it the same
careful way every time, and it writes up the result in a consistent format with
the full transcript attached.

---

## Who it is for

The product serves three distinct audiences out of the same system.

**Companies and recruiters.** Post a role, collect applications, and let
candidates interview themselves. Review structured reports instead of
conducting calls. Read the full transcript of any conversation whenever a score
needs checking.

**Candidates applying for a real job.** Interview at a time that suits them,
without taking time off work for a call that might last ten minutes. Get
written, constructive feedback on their performance, which almost never happens
in normal hiring.

**Job seekers who want to practise.** A self-service practice mode where anyone
can upload a job description they are targeting plus their own résumé, pick an
interview style and a difficulty, and rehearse a realistic interview. They get
the same detailed scored report at the end. This runs under the label *Noventra
Practice Lab* and works without an account at all for a first try.

That third audience matters commercially: it is a consumer product sharing one
engine with the business product, which means two revenue paths with no second
build.

---

## What an interview actually feels like

Here is the full experience, start to finish.

**1. Setting up.** A candidate applying for a real job uploads their résumé as a
PDF when they apply. Someone practising uploads both a job description and their
résumé, then chooses the interview style and how hard they want it to be.

**2. Joining.** They open the interview room in their browser. Nothing to
install, no plugin, no app. It works on a normal laptop.

**3. The first question.** The interviewer opens the way a person would: *"Great,
let's start. Could you please tell me a little bit about yourself?"* It then
works through their background before moving to harder ground.

**4. Answering.** Two options, and they can switch freely at any point:

- **Speak.** Press *Record Voice* and talk. Their words appear on screen as text
  within a second or two, so they can see they were understood correctly. The
  interviewer's reply comes back as spoken audio, read aloud in a natural voice.
- **Type.** Some people prefer typing, some are in a noisy room, some have a
  patchy microphone. Typing is a first-class option, not a fallback.

**5. The conversation develops.** This is the part that distinguishes AudioBot
from a form with a timer. Each question is built from the previous answer. Give a
vague answer and it asks you to be specific. Mention a project and it asks what
your actual role in it was. Claim a result and, on the harder settings, it asks
for the number.

Here is a real exchange from the live system:

> **Candidate:** "I have three years of HR coordination experience."
>
> **AudioBot:** "Thank you for sharing your experience. Could you elaborate on
> your experience coordinating HR activities, perhaps by describing a typical day
> or a specific project you worked on?"

It acknowledged the answer in one line, then asked one question that could only
follow from what was said. It does not ask two things at once, and it does not
move on until it has something to work with.

**6. A coding exercise, if the role needs one.** In a technical interview, the
interviewer can decide a question needs actual code. The screen switches to a
proper code editor, the candidate writes their solution, and submits it. More on
this below.

**7. It ends itself.** At some point the interviewer concludes it has enough
evidence and closes the conversation. The candidate does not have to guess how
long to keep going, and the recruiter does not have to set a timer.

**8. The report.** A full written evaluation is generated within seconds and is
available as a downloadable PDF.

Replies arrive in about **three seconds** on the live system, measured end to
end on a text turn. It feels like a conversation, not a form submission.

---

## Everything it can do

A complete feature inventory, grouped by what it gives you.

### The interviewer

**It has read the material.** Both the job description and the candidate's
résumé are loaded before the first question. Questions reference the candidate's
actual history and the role's actual requirements.

**Three interview styles**, each a genuinely different interviewer with different
instructions and priorities:

| Style | What it assesses |
|---|---|
| **HR** | Cultural fit. Opens with background, education and personal context, then moves to personality, values, teamwork, communication style, adaptability, accountability and conflict handling. |
| **Behavioural** | Past performance. Works in the STAR framework (Situation, Task, Action, Result) and actively prompts for whichever part the candidate left out — most often the result. Probes leadership, conflict resolution, problem-solving under pressure and teamwork. |
| **Technical** | Hard skills. Reads the required technologies out of the job description and the résumé, starts with concepts, then moves to system design, optimisation and edge cases. |

**Three difficulty levels** — easy, medium, hard — that change interviewer
behaviour rather than just the question list. On hard, a behavioural interviewer
pushes for specific metrics and challenges the candidate's decisions. On easy, it
stays with general experience. On medium and hard, a technical interviewer brings
in system design and complex edge cases.

**One question at a time.** Every style is instructed to ask exactly one thing
and wait. This sounds minor and is not. Multi-part questions are the most common
way interviews produce unusable answers, because candidates answer whichever part
they liked and the rest quietly disappears.

**It does not grade you to your face.** The interviewer is explicitly instructed
to give no feedback, evaluation or judgement during the conversation, and to hold
a professional, neutral tone. Candidates do not get rattled mid-interview by a
hint that an answer landed badly. All evaluation happens afterwards, in writing.

### Voice

**Speech to text.** Candidates speak naturally. Recordings are capped at 50
seconds per clip, which keeps answers focused and transcription fast.

**Text to speech.** The interviewer's replies are spoken aloud in a natural
voice, so the candidate can listen instead of reading.

**Visible transcription.** What the system heard is shown on screen immediately,
before the interviewer replies. The candidate is never left wondering whether a
mumbled sentence was understood. This is also a fairness feature: a candidate
with a strong accent can see exactly what was captured.

**The report knows speech is messy.** The evaluation step is specifically
instructed not to quote filler words — the "uh", the "um", the false starts — and
to paraphrase rather than quote raw transcription. Nobody is marked down for
sounding like a human being talking out loud.

### Live coding challenges

For technical interviews, the system includes a real code editor, the same
editing engine that powers Visual Studio Code.

- **Seven languages**: Python, JavaScript, TypeScript, Java, C++, SQL and Go.
- **Starter code** for each language, so nobody wastes time typing boilerplate.
- **A 15-minute countdown** per challenge. The editor locks when it reaches zero.
- **Submission history**, so a candidate can iterate and the reviewer can see how
  the solution developed rather than just the final state.
- **The interviewer decides when code is needed.** It is not a separate test
  stapled onto the interview; the interviewer chooses to set a coding problem
  when the conversation calls for one, and the screen changes to match.
- **Submitted code becomes evidence.** Every submission is attached to the final
  evaluation, which assesses correctness, edge cases, complexity and style.

### Knowing when to stop

This is one of the most carefully built parts of the product.

**The interviewer decides.** After each answer, a separate evaluation step asks:
do we now have enough evidence to conclude? A strong candidate who demonstrates
competence quickly gets a shorter interview. A candidate giving thin answers gets
more chances to show something.

**There is always a ceiling.** No interview runs forever: 8 questions for HR, 10
for behavioural, 12 for technical. Candidates are never trapped.

**Vague answers do not end an interview early.** The system is explicitly told not
to treat evasive or non-committal answers as satisfactory evidence until enough
ground has actually been covered. Dodging questions does not get you out faster.

**The candidate can stop whenever they want.** If someone asks to end the
interview, the system recognises it, acknowledges it, and closes without
badgering them for more. The session is marked as *candidate terminated* so the
reviewer knows exactly what happened and does not read a short interview as a bad
one.

**Pushback gets handled like a professional would handle it.** If a candidate
challenges whether a question is relevant, refuses a topic, or wants to move on,
the interviewer does not simply give up and it does not steamroll them either. It
briefly explains why the area matters to the role, then tries two or three
concise recovery follow-ups before accepting that the area cannot be assessed.
After three refusals it concludes and records that the evidence was not
obtainable. An interviewer that collapses the moment it meets resistance produces
useless screens; so does one that will not take no for an answer.

### The report

Generated automatically the moment the interview ends, delivered as a PDF.

**Scores out of 10 across six dimensions**, plus an overall score:

| Dimension | What it captures |
|---|---|
| Communication | How well they convey ideas |
| Clarity | Whether answers were structured and followable |
| Role fit | Alignment with the job description and their own background |
| Problem solving | How they reason through difficulty |
| Confidence | Composure and conviction |
| Professionalism | Conduct through the conversation |

**A five-tier hiring recommendation**: strong no, no, maybe, yes, strong yes.
Five tiers instead of a yes/no, because real screening decisions have a middle,
and a forced binary hides exactly the cases a human should look at.

**Written analysis, not bullet fragments.** Strengths and concerns are full
paragraphs, each citing specific moments from the conversation, with an explicit
instruction not to recycle the same example across sections. The summary is a
detailed multi-paragraph assessment.

**A rationale for the recommendation**, stating plainly whether the interview was
complete or partial and why the conclusion follows.

**Candidate-facing feedback**, written constructively and professionally. This can
be sent to the candidate. It is the piece most hiring processes never produce,
and it turns a rejection into something a person can actually use.

**An honesty warning when the evidence is thin.** If fewer than four questions
were asked, or fewer than three substantive answers were captured, or the session
ended early or partially, the report carries a prominent *Data Confidence*
warning: limited evidence, treat these scores as directional rather than
definitive. The system refuses to present a confident score it has not earned.
For a tool that influences someone's career, this matters more than almost any
other feature.

**Hard facts about the session**, printed on the report:

- Interview type and difficulty
- Completion status, in plain words
- When it started, when it finished, and how long it took
- How many questions were asked
- How many answers were actually substantive, as distinct from the question count
- An estimate of how often the candidate refused or pushed back
- When the report was generated

**The complete transcript** is appended to every report. Every score is auditable
against the actual conversation. If a candidate or a manager disputes a
conclusion, the evidence is in the same document.

### Honest scoring

The evaluation step is deliberately built to be hard to fool, and these rules are
worth stating plainly because they are what makes a report trustworthy:

- **Harsh calibration** when a transcript is vague, evasive or incomplete. A
  deflected answer is not counted as evidence.
- **Short interviews do not automatically score badly on role fit.** Fit is
  judged from the job description and résumé, so a candidate who ended early is
  not penalised on fit for that reason alone. If their actual behaviour or
  answers undermine fit, that does count.
- **Ending early or abusively is penalised** on professionalism, clarity,
  confidence and the overall score, and is stated plainly in the summary rather
  than quietly absorbed into a number.
- **Untested skills are reported as untested.** If no code was submitted, the
  report says the evidence was insufficient instead of inventing an assessment.

### For recruiters

**Post roles** with the job description uploaded as a PDF.

**Collect applications**, each with the candidate's résumé attached.

**See applicants by stage** — everyone, just the new applications, or just those
moved forward — so a long list stays workable.

**Read any full transcript**, not only the report. Scores are a summary; the
conversation is the source.

**Download any report** as a PDF, ready to forward or file.

**Strict separation between companies.** A recruiter sees only their own roles
and only the candidates who applied to them. This is enforced on the server for
every single request, not hidden in the interface.

### For candidates

**A personal portal** listing the roles open to them, the applications they have
made, and their interviews.

**Their report and written feedback**, delivered in the interview room as soon as
the interview finishes, as a downloadable PDF. A candidate can reach their own
reports and nothing belonging to anyone else.

**Recent sessions kept to hand**, so a conversation is easy to return to.

**Light and dark themes**, following the computer's own setting by default.

### Practice mode

**Open to anyone.** A visitor can start a practice interview without creating an
account, which removes the single biggest barrier to anyone trying the product.

**Bring your own target.** Upload the real job description you are chasing,
either as a PDF or pasted as text, plus your own résumé. The practice interview
is specific to the job you actually want.

**Pick your style and difficulty** from the three of each described above.

**The same full report** as a real interview, including the candidate-facing
feedback.

### Reliability

**An interview survives a dropped connection.** This is the feature nobody asks
for and everybody needs. The entire conversation is remembered on the server
after every single turn, not held in the browser. If a candidate's wifi drops, a
train goes into a tunnel, or a laptop sleeps, the browser quietly reconnects and
the interview continues exactly where it left off, with the full conversation
intact.

Without this, a connection blip 20 minutes into an interview destroys 20 minutes
of a candidate's effort and produces an unusable report. The system was
specifically tested to confirm that a conversation left idle stays alive and is
still usable afterwards.

**Reconnection is automatic and patient.** The browser retries on its own, waiting
progressively longer between attempts so it does not hammer a struggling network.
The connection status is visible in the interface, and the controls are disabled
while reconnecting, so a candidate is never typing into a void.

**It knows when not to retry.** If a session has genuinely expired, it says so
clearly and asks the candidate to sign in again instead of retrying forever
behind a spinner.

**A finished interview stays finished.** Once an interview is complete, further
messages are declined with a clear explanation and a link to the report. Reports
cannot be gamed by reopening a session.

### Security and privacy

- **Every account has a role** — candidate, recruiter or administrator — and each
  role can reach only what it should.
- **Ownership is checked on every request.** Beyond roles, the server verifies
  that the specific person asking actually owns the specific record requested.
- **Sessions expire** after 30 minutes of validity by default.
- **"Remember this device" is honoured properly.** Choosing not to be remembered
  means the session is discarded when the browser closes, and the system actively
  clears the other storage so a token cannot linger where it was not wanted.
- **Sign-up and sign-in are rate limited** to blunt automated abuse.
- **Interviews are authenticated.** Nobody can open someone else's interview by
  guessing a web address.
- **Uploaded files are not kept.** When a résumé or job description PDF is
  uploaded, the system reads the text out of it and stores only that text. The
  original document is never written to disk or to storage. There is no archive
  of candidate files to leak, and nothing to clean up later.
- **Generated reports are held in managed cloud storage**, not on a server's
  local disk, so they survive restarts and are served consistently.

### Operations

- **A service health check**, used by the hosting platform to confirm the
  application is alive and to restart it automatically if it is not.
- **A live check against the AI provider** that sends a real request to the
  model, so an outage at the model vendor is visible immediately rather than
  discovered through a candidate's failed interview.
- **Structured logging** suitable for searching and alerting in production.
- **Automated test suite**: 51 automated checks on the server and 5 on the
  interface, which must all pass before any change is allowed to reach
  production. This is enforced by the deployment system, not by anyone
  remembering to run them.

---

## What is genuinely hard about this

Four things in this product are much harder than they look, and they are the
reason it is not a weekend build.

**1. Memory that survives anything.** An interview is a long, stateful
conversation. Remembering it inside the browser is easy and worthless, because
the first dropped connection erases it. AudioBot records the full state of every
interview on the server after each turn, keyed to that interview, which is what
allows a candidate to lose their connection entirely and resume mid-sentence.

**2. Keeping a live audio conversation open on modern cloud infrastructure.**
A continuous two-way connection is a poor fit for cloud platforms designed around
short requests. Early in development, interviews were dying roughly 20 seconds
after they started. Diagnosing it took measuring the exact moment of failure
across a dozen configurations and tracing it to an interaction between a recently
changed web server default and the hosting platform's network layer. It needed two
specific settings together, neither sufficient alone. It is now documented in
detail so it cannot be broken again by a well-meaning change. Conversations have
been verified to stay alive and usable through long idle periods.

**3. Judgement about when to stop.** Deciding that an interview has produced
enough evidence is the difference between a conversation and a questionnaire. It
requires evaluating the whole conversation after each answer, resisting the
temptation to accept a vague answer as a satisfactory one, and distinguishing a
candidate who is done from one who is stalling.

**4. Running it for almost nothing.** The whole platform costs roughly **$3.50
per month** to operate. That is not an accident of low usage, it is the result of
specific choices:

- The speech recognition provider was chosen after comparing free allowances
  directly. The one in use allows 28,800 seconds of audio per day at no cost;
  the obvious alternative allowed 60 minutes per month.
- The database runs on a free tier that covers current needs, replacing a managed
  database that cost about $27 per month on its own.
- The interview evaluation step is skipped entirely for the first few questions,
  because at that stage it would essentially never decide to end the interview.
  That removes a meaningful fraction of all AI calls with no effect on quality.

The margin story follows from this. The cost of an interview is a few AI calls
and a few seconds of audio processing. At any plausible price point the gross
margin is very high, and it stays high as volume grows.

---

## Where it runs

The service runs on Google Cloud Run, which starts more copies of itself
automatically when more candidates arrive and scales back to nothing when they do
not. There is no server anyone has to look after, and no capacity planning before
a hiring push.

The candidate-facing interface is delivered through Vercel's global network, so it
loads quickly regardless of where the candidate is.

Both halves deploy automatically. A change is tested, built and released without
anyone touching production by hand, and the automated tests must pass before the
release is allowed to proceed. Credentials are handled through short-lived
identity federation, so no long-lived password or key is stored anywhere in the
codebase.

Ten candidates or ten thousand, the architecture does not change.

---

## Current status

The platform is **built, deployed and working in production today**. This is not a
prototype or a set of mockups. The interview flow has been exercised end to end
against the live system: a real conversation with real spoken audio, a real AI
interviewer, and a real generated report.

What exists and works right now:

- The complete interview experience, by voice and by text
- All three interview styles and all three difficulty levels
- Live coding challenges in seven languages
- Automatic report generation with scoring and a hiring recommendation
- The recruiter workspace and the candidate portal
- Self-service practice mode, including access without an account
- Automatic deployment with a mandatory test gate

### Honest limitations

Worth stating plainly, because a client will find these anyway and it is better
they hear them from us.

- **Submitted code is reviewed, not executed.** The AI assesses correctness,
  edge cases, complexity and style by reading the code. It does not run it
  against test cases. Adding a secure sandbox that executes submissions is a
  clear next step and would make technical scores considerably stronger.
- **Scoring is consistent, not validated.** The same interview produces a
  comparable report every time, and the system flags its own low-confidence
  cases. What has not yet been done is measuring those scores against real hiring
  outcomes to prove they predict job performance. That requires running
  alongside a real hiring pipeline for a few months, and it is the single most
  valuable piece of evidence the product could acquire.
- **No video.** The interview is voice and text. There is no camera, so nothing
  is inferred from a candidate's face or surroundings. Some buyers will want
  video; others will consider its absence a fairness advantage, since appearance
  cannot influence a score that is calculated from words alone.
- **Practice mode for guests relies on light friction**, not a hard limit. A
  determined visitor can take more than one free practice interview. This is a
  conversion question, not a security one.
- **Branding is inconsistent** between the public pages and the application
  interface, and should be settled before a client demo.
- **No bulk operations yet.** Recruiters work one role and one candidate at a
  time. High-volume users will want bulk invitations, bulk export and
  side-by-side candidate comparison.

### Natural next steps

In rough order of how much they would add:

1. **Execute submitted code** in a secure sandbox against real test cases.
2. **Side-by-side candidate comparison** for a role, ranked by score, which is
   the first thing a recruiter screening 50 people will ask for.
3. **Calendar and ATS integration**, so AudioBot drops into an existing hiring
   process instead of sitting beside it.
4. **Bulk invitations and export** for high-volume hiring.
5. **More languages**, both spoken and programming, for international hiring.
6. **A scoring validation study** against real hiring outcomes.
7. **Interviewer customisation**, letting a company tune the questioning to its
   own competency framework.

---

## Why this wins

**It replaces work, not clicks.** Many hiring tools make screening slightly more
convenient. This one removes the half-hour call.

**It is specific, not generic.** Every question comes from the candidate's own
résumé and the role's own description. Candidates can tell the difference
immediately, and so can hiring managers reading the transcript.

**It is honest about what it knows.** The data-confidence warning, the five-tier
recommendation with a middle, the recorded distinction between questions asked
and answers actually given, the full transcript attached to every report. A
scoring tool that over-claims gets switched off the first time it is wrong about
someone who mattered. This one tells you when not to trust it.

**It is fair by construction.** Every candidate gets the same interviewer, with
the same instructions and the same patience, at eleven at night or nine in the
morning. It cannot be tired, distracted or in a hurry. It sees no face and hears
no accent it can hold against anyone, and it shows every candidate exactly what
it heard them say.

**It gives candidates something back.** Written, constructive, specific feedback,
for everyone, including the people who are not moving forward. Companies that do
this are remembered well by the 80% they rejected, and those people apply again
and tell other people to.

**It is cheap to run and it scales on its own.** Roughly $3.50 a month today,
with infrastructure that grows automatically with demand.

---

*For the engineering detail behind any of this, see the
[backend documentation](../README.md), the
[project README](../../README.md), and the
[WebSocket reliability notes](websockets-on-cloud-run.md).*
