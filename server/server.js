const express = require("express");
const path = require("path");
const { load, save } = require("./db");
const FACULTY_SEED = require("./facultySeed");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Scope ----
// Feedback can be given for any semester (odd: 1,3,5,7 / even: 2,4,6,8) and
// any department. Sections are only collected for the CSE department, for the
// semesters whose sections appear in the real CSE master timetable (3, 5, 7),
// because the section-wise report exists for CSE only.
const SEMESTER_GROUPS = { odd: [1, 3, 5, 7], even: [2, 4, 6, 8] };
const ALL_SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const REPORT_DEPT = "Computer Science & Engineering";
const CSE_SECTIONS = { 3: ["A", "B", "C", "D"], 5: ["A", "B", "C", "D"], 7: ["A", "B", "C"] };

let state = load();
function persist() { save(state); }

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- helpers ----------
function sumRange(arr, start, end) {
  let s = 0;
  for (let i = start; i < end; i++) s += arr[i];
  return s;
}

function scoreAnswers(answers) {
  const academicSum = sumRange(answers, 0, 5) * 2;
  const disciplineSum = sumRange(answers, 5, 8) * 2;
  const attitudeSum = sumRange(answers, 8, 10) * 2;
  return { academicSum, disciplineSum, attitudeSum, total: academicSum + disciplineSum + attitudeSum };
}

function randomAnswer() {
  // Skewed toward positive responses (typical of real feedback), rarely N/A.
  const roll = Math.random();
  if (roll < 0.05) return 0;
  if (roll < 0.15) return 2;
  if (roll < 0.30) return 3;
  if (roll < 0.60) return 4;
  return 5;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- scope ----------
app.get("/api/scope", (req, res) => {
  res.json({ semesterGroups: SEMESTER_GROUPS, reportDept: REPORT_DEPT, sectionsBySemester: CSE_SECTIONS });
});

// ---------- faculty ----------
app.get("/api/faculty", (req, res) => {
  res.json(state.faculty);
});

app.post("/api/faculty", (req, res) => {
  const { name, dept } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!dept || typeof dept !== "string" || !dept.trim()) {
    return res.status(400).json({ error: "dept is required" });
  }
  const dup = state.faculty.find((f) => f.name === name.trim() && f.dept === dept.trim());
  if (dup) return res.status(409).json({ error: "that faculty member already exists in this department" });
  const faculty = { id: state.nextFacultyId++, name: name.trim(), dept: dept.trim(), createdAt: Date.now() };
  state.faculty.push(faculty);
  persist();
  res.status(201).json(faculty);
});

app.post("/api/faculty/import", (req, res) => {
  const existing = new Set(state.faculty.map((f) => f.name + "|" + f.dept));
  let imported = 0, skipped = 0;
  Object.keys(FACULTY_SEED).forEach((dept) => {
    FACULTY_SEED[dept].forEach((name) => {
      const key = name + "|" + dept;
      if (existing.has(key)) { skipped++; return; }
      state.faculty.push({ id: state.nextFacultyId++, name, dept, createdAt: Date.now() });
      existing.add(key);
      imported++;
    });
  });
  persist();
  res.json({ imported, skipped, total: state.faculty.length });
});

// ---------- feedback ----------
app.get("/api/feedback", (req, res) => {
  const { facultyId } = req.query;
  if (facultyId) {
    return res.json(state.feedback.filter((f) => String(f.facultyId) === String(facultyId)));
  }
  res.json(state.feedback);
});

app.post("/api/feedback", (req, res) => {
  const { facultyId, semester, section, answers } = req.body || {};
  const fac = state.faculty.find((f) => f.id === Number(facultyId));
  if (!fac) return res.status(400).json({ error: "unknown facultyId" });
  if (!Array.isArray(answers) || answers.length !== 10 || answers.some((a) => typeof a !== "number" || a < 0 || a > 5)) {
    return res.status(400).json({ error: "answers must be 10 numbers between 0 and 5" });
  }
  const sem = Number(semester);
  if (!ALL_SEMESTERS.includes(sem)) {
    return res.status(400).json({ error: "semester must be between 1 and 8" });
  }
  // Section is only collected for CSE, for semesters that have real sections.
  let sec = null;
  if (fac.dept === REPORT_DEPT && CSE_SECTIONS[sem]) {
    if (!CSE_SECTIONS[sem].includes(section)) {
      return res.status(400).json({ error: "a valid section is required for CSE semester " + sem });
    }
    sec = section;
  }
  const scored = scoreAnswers(answers);
  const doc = {
    id: state.nextFeedbackId++,
    facultyId: fac.id,
    semester: sem,
    dept: fac.dept,
    section: sec,
    answers,
    academicSum: scored.academicSum,
    disciplineSum: scored.disciplineSum,
    attitudeSum: scored.attitudeSum,
    total: scored.total,
    ts: Date.now(),
    sample: false
  };
  state.feedback.push(doc);
  persist();
  res.status(201).json(doc);
});

app.post("/api/feedback/generate-sample", (req, res) => {
  const perFaculty = Math.max(1, Math.min(50, Number(req.body && req.body.perFaculty) || 6));
  let written = 0;
  state.faculty.forEach((fac) => {
    const isCse = fac.dept === REPORT_DEPT;
    for (let r = 0; r < perFaculty; r++) {
      const answers = Array.from({ length: 10 }, randomAnswer);
      const scored = scoreAnswers(answers);
      // CSE samples use semesters 3/5/7 so the section-wise report has data;
      // other departments use any semester 1-8 and carry no section.
      const sem = isCse ? pick([3, 5, 7]) : pick(ALL_SEMESTERS);
      const section = isCse && CSE_SECTIONS[sem] ? pick(CSE_SECTIONS[sem]) : null;
      state.feedback.push({
        id: state.nextFeedbackId++,
        facultyId: fac.id,
        semester: sem,
        dept: fac.dept,
        section,
        answers,
        academicSum: scored.academicSum,
        disciplineSum: scored.disciplineSum,
        attitudeSum: scored.attitudeSum,
        total: scored.total,
        ts: Date.now(),
        sample: true
      });
      written++;
    }
  });
  persist();
  res.json({ written, facultyCount: state.faculty.length });
});

app.delete("/api/feedback/sample", (req, res) => {
  const before = state.feedback.length;
  state.feedback = state.feedback.filter((f) => !f.sample);
  const deleted = before - state.feedback.length;
  persist();
  res.json({ deleted });
});

// ---------- aggregated scores (all departments) ----------
app.get("/api/scores", (req, res) => {
  const byFaculty = {};
  state.feedback.forEach((f) => {
    (byFaculty[f.facultyId] = byFaculty[f.facultyId] || []).push(f);
  });
  const rows = state.faculty.map((fac) => {
    const entries = byFaculty[fac.id] || [];
    const n = entries.length;
    const avg = (key) => (n ? entries.reduce((s, e) => s + (e[key] || 0), 0) / n : 0);
    return {
      id: fac.id,
      name: fac.name,
      dept: fac.dept,
      responses: n,
      avgTotal: Number(avg("total").toFixed(2)),
      avgAcademic: Number(avg("academicSum").toFixed(2)),
      avgDiscipline: Number(avg("disciplineSum").toFixed(2)),
      avgAttitude: Number(avg("attitudeSum").toFixed(2))
    };
  });
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`FCI Score app running at http://localhost:${PORT}`);
});
