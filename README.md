# FCI Score — MSRIT Faculty Feedback (v3)

Students give anonymous feedback (10 MCQs: 5 academics, 3 discipline,
2 attitude). Each response scores `2 x (sum of the 10 answers)`, max 100, and a
faculty member's **FCI Score** is the average over all their responses. The
appraisal form reads these scores from `GET /api/scores`.

## What's in this version

- **Give Feedback** — Semester type (Odd / Even) -> Semester (odd: 1, 3, 5, 7;
  even: 2, 4, 6, 8) -> Department (all 24) -> Faculty (every faculty member of
  the chosen department). For **Computer Science & Engineering** in
  semesters 3, 5 and 7 a Section dropdown also appears (3 and 5: A-D, 7: A-C),
  because the section-wise report is CSE-only.
- **Faculty Scores** — every faculty member of every department, with their FCI
  score and Academics / Discipline / Attitude breakdown. A department filter
  narrows the list.
- **Reports** — section-wise report for CSE only: pick a Sem + Section, view
  every faculty's breakdown, "Print / Save as PDF" to print it.

Faculty are no longer restricted to the sections they teach (that strict
CSE timetable matching from the previous version was removed on request).

## Run

```bash
cd fci_score_v3        # the folder that contains package.json
npm install
npm start
```

Open http://localhost:3000, go to **Faculty Scores**, click
**Import MSRIT faculty list** (408 faculty, 24 departments), then optionally
**Generate sample responses**.

## Files

```
server/server.js       Express API
server/db.js           tiny JSON-file store (creates server/data.json on first run)
server/facultySeed.js  the department -> faculty roster
public/                index.html, styles.css, app.js
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | /api/scope | odd/even semester groups, CSE report department, CSE sections |
| GET / POST | /api/faculty | list / add `{ name, dept }` |
| POST | /api/faculty/import | import the full roster (skips duplicates) |
| GET / POST | /api/feedback | list / submit `{ facultyId, semester, section?, answers[10] }` |
| POST | /api/feedback/generate-sample | `{ perFaculty }` demo responses for every faculty |
| DELETE | /api/feedback/sample | remove all sample responses |
| GET | /api/scores | per-faculty averages (used by the appraisal app) |

Data from the previous version (`server/data.json`) still works if you copy it
across; extra fields it carries are ignored.
