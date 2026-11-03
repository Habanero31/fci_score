(function () {
  "use strict";

  // ---- Question bank: 5 academics, 3 discipline, 2 attitude ----
  var QUESTIONS = [
    { cat: "academic", text: "Explains concepts clearly and resolves doubts effectively." },
    { cat: "academic", text: "Comes well-prepared and covers the syllabus on schedule." },
    { cat: "academic", text: "Uses examples and real-world applications to aid understanding." },
    { cat: "academic", text: "Encourages questions and active class participation." },
    { cat: "academic", text: "Assessments (tests/assignments) reflect what was actually taught." },
    { cat: "discipline", text: "Maintains punctuality in taking classes." },
    { cat: "discipline", text: "Manages classroom discipline effectively." },
    { cat: "discipline", text: "Is fair and consistent while grading and evaluating." },
    { cat: "attitude", text: "Is approachable and helpful outside class hours." },
    { cat: "attitude", text: "Treats all students with respect and fairness." }
  ];
  var OPTIONS = [
    { v: 5, label: "Strongly Agree" },
    { v: 4, label: "Agree" },
    { v: 3, label: "Not So Agree" },
    { v: 2, label: "Not Agree" },
    { v: 1, label: "Strongly Disagree" },
    { v: 0, label: "N/A" }
  ];
  var CAT_LABEL = { academic: "Academics", discipline: "Discipline", attitude: "Attitude" };
  var CAT_COUNT = { academic: 5, discipline: 3, attitude: 2 };

  var facultyList = [];
  var SEMESTER_GROUPS = { odd: [1, 3, 5, 7], even: [2, 4, 6, 8] };
  var REPORT_DEPT = "Computer Science & Engineering";
  var CSE_SECTIONS = { 3: ["A", "B", "C", "D"], 5: ["A", "B", "C", "D"], 7: ["A", "B", "C"] };

  // ---------- tiny fetch helpers ----------
  function apiGet(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("GET " + url + " failed (" + r.status + ")");
      return r.json();
    });
  }
  function apiPost(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || ("POST " + url + " failed")); });
      return r.json();
    });
  }
  function apiDelete(url) {
    return fetch(url, { method: "DELETE" }).then(function (r) {
      if (!r.ok) throw new Error("DELETE " + url + " failed (" + r.status + ")");
      return r.json();
    });
  }

  // ---------- boot ----------
  async function boot() {
    try {
      var scope = await apiGet("/api/scope");
      if (scope.semesterGroups) SEMESTER_GROUPS = scope.semesterGroups;
      if (scope.reportDept) REPORT_DEPT = scope.reportDept;
      if (scope.sectionsBySemester) CSE_SECTIONS = scope.sectionsBySemester;
    } catch (e) { /* fall back to the defaults above */ }

    renderQuestions();
    wireCascade();
    wireTabs();
    wireStudentForm();
    wireAdmin();
    await refreshFaculty();
  }

  var reportsState = { semSection: null };
  var allFeedback = [];

  async function refreshFaculty() {
    try {
      facultyList = await apiGet("/api/faculty");
    } catch (e) {
      facultyList = [];
    }
    refreshDeptOptions();
    refreshSectionOptions();
    refreshFacultyOptions();
    fillDeptDatalist();
    updateSubmitEnabled();
    if (isActive("view-admin")) await renderLedger();
  }

  function isActive(id) {
    var v = document.getElementById(id);
    return v && v.classList.contains("active");
  }

  // ---------- questions ----------
  function renderQuestions() {
    var mount = document.getElementById("questions-mount");
    var cats = ["academic", "discipline", "attitude"];
    var html = "";
    var qi = 0;
    cats.forEach(function (cat) {
      html += '<div class="category"><div class="category-head"><h3>' + CAT_LABEL[cat] + '</h3><span class="count">' + CAT_COUNT[cat] + ' questions</span></div>';
      QUESTIONS.forEach(function (q, idx) {
        if (q.cat !== cat) return;
        qi++;
        html += '<div class="question"><p class="q-text">' + qi + '. ' + escapeHtml(q.text) + '</p><div class="opts">';
        OPTIONS.forEach(function (opt, oi) {
          var name = "q" + idx;
          var id = "q" + idx + "_o" + oi;
          html += '<div class="opt"><input type="radio" name="' + name + '" id="' + id + '" value="' + opt.v + '" data-qidx="' + idx + '"><label for="' + id + '">' + opt.label + '</label></div>';
        });
        html += '</div></div>';
      });
      html += '</div>';
    });
    mount.innerHTML = html;
    mount.addEventListener("change", updateSubmitEnabled);
  }

  // Section is only asked for CSE, in semesters that have real sections.
  function sectionApplies() {
    var sem = Number(document.getElementById("semester-select").value);
    var dept = document.getElementById("dept-select").value;
    return dept === REPORT_DEPT && !!CSE_SECTIONS[sem];
  }

  function updateSubmitEnabled() {
    var typeSel = document.getElementById("semtype-select");
    var semSel = document.getElementById("semester-select");
    var deptSel = document.getElementById("dept-select");
    var secSel = document.getElementById("section-select");
    var facSel = document.getElementById("faculty-select");
    var btn = document.getElementById("submit-btn");
    if (!facSel || !btn) return;
    var allAnswered = QUESTIONS.every(function (_, idx) {
      return !!document.querySelector('input[name="q' + idx + '"]:checked');
    });
    var sectionOk = !sectionApplies() || !!secSel.value;
    btn.disabled = !(typeSel.value && semSel.value && deptSel.value && sectionOk && facSel.value && allAnswered);
  }

  // ---------- tabs ----------
  function wireTabs() {
    var buttons = document.querySelectorAll("nav.tabs button");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        buttons.forEach(function (b) { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
        btn.classList.add("active"); btn.setAttribute("aria-selected", "true");
        document.querySelectorAll("section.view").forEach(function (v) { v.classList.remove("active"); });
        document.getElementById("view-" + btn.dataset.view).classList.add("active");
        if (btn.dataset.view === "admin") await renderLedger();
        if (btn.dataset.view === "reports") {
          reportsState = { semSection: null };
          await refreshReportsData();
          renderReports();
        }
      });
    });
  }

  // ---------- cascade: semester type -> semester -> department -> (section) -> faculty ----------
  function wireCascade() {
    var typeSel = document.getElementById("semtype-select");
    var semSel = document.getElementById("semester-select");
    var deptSel = document.getElementById("dept-select");
    var secSel = document.getElementById("section-select");
    var facSel = document.getElementById("faculty-select");

    typeSel.addEventListener("change", function () {
      semSel.value = ""; deptSel.value = ""; secSel.value = ""; facSel.value = "";
      refreshSemesterOptions(); refreshDeptOptions(); refreshSectionOptions(); refreshFacultyOptions(); updateSubmitEnabled();
    });
    semSel.addEventListener("change", function () {
      deptSel.value = ""; secSel.value = ""; facSel.value = "";
      refreshDeptOptions(); refreshSectionOptions(); refreshFacultyOptions(); updateSubmitEnabled();
    });
    deptSel.addEventListener("change", function () {
      secSel.value = ""; facSel.value = "";
      refreshSectionOptions(); refreshFacultyOptions(); updateSubmitEnabled();
    });
    secSel.addEventListener("change", updateSubmitEnabled);
    facSel.addEventListener("change", updateSubmitEnabled);
  }

  function refreshSemesterOptions() {
    var type = document.getElementById("semtype-select").value;
    var semSel = document.getElementById("semester-select");
    if (!type) {
      semSel.disabled = true;
      semSel.innerHTML = '<option value="">Select semester type first…</option>';
      return;
    }
    semSel.disabled = false;
    semSel.innerHTML = '<option value="">Select semester…</option>' + SEMESTER_GROUPS[type].map(function (s) {
      return '<option value="' + s + '">Semester ' + s + '</option>';
    }).join("");
  }

  function refreshDeptOptions() {
    var semSel = document.getElementById("semester-select");
    var deptSel = document.getElementById("dept-select");
    var current = deptSel.value;

    if (!semSel.value) {
      deptSel.disabled = true;
      deptSel.innerHTML = '<option value="">Select semester first…</option>';
      return;
    }
    var depts = uniqueSorted(facultyList.map(function (f) { return f.dept || "—"; }));
    deptSel.disabled = false;
    if (!depts.length) {
      deptSel.innerHTML = '<option value="">No departments yet — import faculty in the Faculty Scores tab</option>';
      return;
    }
    deptSel.innerHTML = '<option value="">Select department…</option>' + depts.map(function (d) {
      return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
    }).join("");
    if (current && depts.indexOf(current) !== -1) deptSel.value = current;
  }

  function refreshSectionOptions() {
    var block = document.getElementById("section-block");
    var secSel = document.getElementById("section-select");
    var current = secSel.value;
    if (!sectionApplies()) {
      block.style.display = "none";
      secSel.innerHTML = '<option value="">Select section…</option>';
      return;
    }
    var sem = Number(document.getElementById("semester-select").value);
    var opts = CSE_SECTIONS[sem] || [];
    block.style.display = "block";
    secSel.innerHTML = '<option value="">Select section…</option>' + opts.map(function (s) {
      return '<option value="' + s + '">Section ' + s + '</option>';
    }).join("");
    if (current && opts.indexOf(current) !== -1) secSel.value = current;
  }

  // Faculty list depends only on the chosen department.
  function refreshFacultyOptions() {
    var deptSel = document.getElementById("dept-select");
    var facSel = document.getElementById("faculty-select");
    var dept = deptSel.value;
    var current = facSel.value;

    if (!dept) {
      facSel.disabled = true;
      facSel.innerHTML = '<option value="">Select department first…</option>';
      return;
    }
    var matches = facultyList.filter(function (f) { return (f.dept || "—") === dept; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    facSel.disabled = false;
    if (!matches.length) {
      facSel.innerHTML = '<option value="">No faculty found</option>';
      return;
    }
    facSel.innerHTML = '<option value="">Select faculty…</option>' + matches.map(function (f) {
      return '<option value="' + f.id + '">' + escapeHtml(f.name) + '</option>';
    }).join("");
    if (current && matches.some(function (f) { return String(f.id) === current; })) facSel.value = current;
  }

  function uniqueSorted(arr) {
    var seen = {}; var out = [];
    arr.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
    out.sort();
    return out;
  }

  // ---------- student submit ----------
  function wireStudentForm() {
    var form = document.getElementById("feedback-form");
    var again = document.getElementById("again-btn");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var semSel = document.getElementById("semester-select");
      var secSel = document.getElementById("section-select");
      var facSel = document.getElementById("faculty-select");
      var msg = document.getElementById("form-msg");
      var btn = document.getElementById("submit-btn");
      if (!facSel.value || !semSel.value) return;

      var answers = QUESTIONS.map(function (_, idx) {
        var checked = document.querySelector('input[name="q' + idx + '"]:checked');
        return checked ? parseInt(checked.value, 10) : null;
      });
      if (answers.some(function (a) { return a === null; })) {
        msg.textContent = "Please answer every question."; msg.className = "form-msg err";
        return;
      }

      btn.disabled = true;
      msg.textContent = "Submitting…"; msg.className = "form-msg";
      try {
        await apiPost("/api/feedback", {
          facultyId: Number(facSel.value),
          semester: Number(semSel.value),
          section: sectionApplies() ? secSel.value : null,
          answers: answers
        });
        document.getElementById("student-form-wrap").style.display = "none";
        document.getElementById("confirm-block").style.display = "block";
      } catch (err) {
        msg.textContent = "Couldn't submit — " + err.message; msg.className = "form-msg err";
        btn.disabled = false;
      }
    });

    again.addEventListener("click", function () {
      document.getElementById("feedback-form").reset();
      document.getElementById("semtype-select").value = "";
      document.getElementById("semester-select").value = "";
      document.getElementById("dept-select").value = "";
      document.getElementById("section-select").value = "";
      refreshSemesterOptions(); refreshDeptOptions(); refreshSectionOptions(); refreshFacultyOptions();
      document.getElementById("form-msg").textContent = "";
      document.getElementById("confirm-block").style.display = "none";
      document.getElementById("student-form-wrap").style.display = "block";
      updateSubmitEnabled();
    });
  }

  // ---------- admin ----------
  function fillDeptDatalist() {
    var dl = document.getElementById("dept-datalist");
    if (!dl) return;
    dl.innerHTML = uniqueSorted(facultyList.map(function (f) { return f.dept; })).map(function (d) {
      return '<option value="' + escapeHtml(d) + '"></option>';
    }).join("");
  }

  function wireAdmin() {
    document.getElementById("import-faculty-btn").addEventListener("click", async function () {
      var btn = this;
      var original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Importing…";
      try {
        var result = await apiPost("/api/faculty/import", {});
        btn.textContent = "Imported " + result.imported + " (skipped " + result.skipped + ")";
        await refreshFaculty();
      } catch (e) {
        btn.textContent = "Import failed";
      }
      setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 2200);
    });

    var toggleBtn = document.getElementById("toggle-add-faculty");
    var panel = document.getElementById("add-faculty-panel");
    toggleBtn.addEventListener("click", function () { panel.classList.toggle("open"); });

    document.getElementById("save-fac-btn").addEventListener("click", async function () {
      var nameEl = document.getElementById("new-fac-name");
      var deptEl = document.getElementById("new-fac-dept");
      var name = nameEl.value.trim();
      var dept = deptEl.value.trim();
      if (!name) { nameEl.focus(); return; }
      if (!dept) { deptEl.focus(); return; }
      this.disabled = true;
      try {
        await apiPost("/api/faculty", { name: name, dept: dept });
        nameEl.value = ""; deptEl.value = "";
        panel.classList.remove("open");
        await refreshFaculty();
      } catch (e) {
        alert(e.message);
      }
      this.disabled = false;
    });

    document.getElementById("ledger-dept-filter").addEventListener("change", renderLedger);

    document.getElementById("seed-sample-btn").addEventListener("click", async function () {
      var btn = this;
      var clearBtn = document.getElementById("clear-sample-btn");
      var status = document.getElementById("seed-status");
      btn.disabled = true; clearBtn.disabled = true;
      status.className = "form-msg"; status.textContent = "Generating…";
      try {
        var result = await apiPost("/api/feedback/generate-sample", { perFaculty: 6 });
        status.textContent = "Done — generated " + result.written + " sample responses for " + result.facultyCount + " faculty.";
        status.classList.add("ok");
        await renderLedger();
      } catch (e) {
        status.textContent = "Generation failed — check the server terminal for details.";
        status.classList.add("err");
      }
      btn.disabled = false; clearBtn.disabled = false;
    });

    document.getElementById("clear-sample-btn").addEventListener("click", async function () {
      var btn = this;
      var genBtn = document.getElementById("seed-sample-btn");
      var status = document.getElementById("seed-status");
      btn.disabled = true; genBtn.disabled = true;
      status.className = "form-msg"; status.textContent = "Clearing sample feedback…";
      try {
        var result = await apiDelete("/api/feedback/sample");
        status.textContent = "Cleared " + result.deleted + " sample responses.";
        status.classList.add("ok");
        await renderLedger();
      } catch (e) {
        status.textContent = "Couldn't clear sample feedback — please try again.";
        status.classList.add("err");
      }
      btn.disabled = false; genBtn.disabled = false;
    });
  }

  // ---------- faculty scores ledger (all departments) ----------
  async function renderLedger() {
    var mount = document.getElementById("ledger-mount");
    var filterSel = document.getElementById("ledger-dept-filter");
    var countEl = document.getElementById("ledger-count");
    var rows;
    try {
      rows = await apiGet("/api/scores");
    } catch (e) {
      mount.innerHTML = '<div class="empty-state">Couldn\'t load scores from the server.</div>';
      return;
    }
    if (!rows.length) {
      mount.innerHTML = '<div class="empty-state">No faculty yet. Click "Import MSRIT faculty list" to load them.</div>';
      filterSel.innerHTML = '<option value="">All departments</option>';
      countEl.textContent = "";
      return;
    }

    // rebuild the department filter, keeping the current choice
    var chosen = filterSel.value;
    var depts = uniqueSorted(rows.map(function (r) { return r.dept || "—"; }));
    filterSel.innerHTML = '<option value="">All departments (' + rows.length + ')</option>' + depts.map(function (d) {
      var n = rows.filter(function (r) { return (r.dept || "—") === d; }).length;
      return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + ' (' + n + ')</option>';
    }).join("");
    if (chosen && depts.indexOf(chosen) !== -1) filterSel.value = chosen; else chosen = "";

    var shown = chosen ? rows.filter(function (r) { return (r.dept || "—") === chosen; }) : rows;
    shown = shown.slice().sort(function (a, b) {
      var da = a.dept || "", db = b.dept || "";
      return da === db ? a.name.localeCompare(b.name) : da.localeCompare(db);
    });
    var withData = shown.filter(function (r) { return r.responses > 0; }).length;
    countEl.textContent = shown.length + " faculty · " + withData + " with feedback";

    mount.innerHTML = shown.map(function (f) {
      var n = f.responses;
      var pct = Math.max(0, Math.min(100, f.avgTotal));
      return '<div class="ledger-row">' +
        '<div class="who"><div class="name">' + escapeHtml(f.name) + '</div><div class="dept">' + escapeHtml(f.dept || "—") + '</div></div>' +
        '<div class="stat"><div class="score">' + (n ? f.avgTotal.toFixed(1) : "—") + (n ? '<sub>/100</sub>' : '') + '</div><div class="n">' + n + (n === 1 ? " response" : " responses") + '</div></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        (n ? '<div class="breakdown"><span><b>Academics</b> ' + f.avgAcademic.toFixed(1) + '/50</span><span><b>Discipline</b> ' + f.avgDiscipline.toFixed(1) + '/30</span><span><b>Attitude</b> ' + f.avgAttitude.toFixed(1) + '/20</span></div>' : '') +
        '</div>';
    }).join("");
  }

  // ---------- Reports (section-wise, CSE only) ----------
  async function refreshReportsData() {
    try {
      allFeedback = await apiGet("/api/feedback");
    } catch (e) {
      allFeedback = [];
    }
  }

  function renderReports() {
    if (!reportsState.semSection) return renderReportsSections();
    return renderReportsTable(reportsState.semSection);
  }

  function facultyById(id) {
    return facultyList.filter(function (f) { return String(f.id) === String(id); })[0] || null;
  }

  function cseSectioned() {
    return allFeedback.filter(function (f) { return f.section && (f.dept || "—") === REPORT_DEPT; });
  }

  function renderCrumbs(parts) {
    var mount = document.getElementById("report-crumbs");
    mount.innerHTML = "";
    parts.forEach(function (p, i) {
      if (i > 0) {
        var sep = document.createElement("span");
        sep.className = "sep"; sep.textContent = "›";
        mount.appendChild(sep);
      }
      if (p.onClick) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.textContent = p.label;
        btn.addEventListener("click", p.onClick);
        mount.appendChild(btn);
      } else {
        var span = document.createElement("span");
        span.className = "current"; span.textContent = p.label;
        mount.appendChild(span);
      }
    });
  }

  function renderReportsSections() {
    renderCrumbs([{ label: REPORT_DEPT }]);
    var body = document.getElementById("report-body");
    var keys = {};
    cseSectioned().forEach(function (f) {
      var key = "Sem " + f.semester + " - " + f.section;
      keys[key] = (keys[key] || 0) + 1;
    });
    var sortedKeys = Object.keys(keys).sort(function (a, b) {
      var pa = a.match(/Sem (\d+) - (.+)/), pb = b.match(/Sem (\d+) - (.+)/);
      if (Number(pa[1]) !== Number(pb[1])) return Number(pa[1]) - Number(pb[1]);
      return pa[2] < pb[2] ? -1 : 1;
    });
    if (!sortedKeys.length) {
      body.innerHTML = '<div class="empty-state">No CSE section-tagged feedback yet. Submit CSE feedback for semester 3, 5 or 7 (or generate sample responses) to see reports here.</div>';
      return;
    }
    body.innerHTML = '<div class="pick-list">' + sortedKeys.map(function (k) {
      return '<button type="button" class="pick-row" data-key="' + escapeHtml(k) + '">' +
        '<div><div class="pick-name">' + escapeHtml(k) + '</div><div class="pick-meta">' + keys[k] + ' response' + (keys[k] === 1 ? "" : "s") + '</div></div>' +
        '<div class="pick-arrow">›</div></button>';
    }).join("") + '</div>';
    body.querySelectorAll(".pick-row").forEach(function (row) {
      row.addEventListener("click", function () {
        reportsState.semSection = row.getAttribute("data-key");
        renderReports();
      });
    });
  }

  function renderReportsTable(semSectionKey) {
    var m = semSectionKey.match(/Sem (\d+) - (.+)/);
    var semester = Number(m[1]), section = m[2];
    renderCrumbs([
      { label: REPORT_DEPT, onClick: function () { reportsState.semSection = null; renderReports(); } },
      { label: semSectionKey }
    ]);

    var entries = cseSectioned().filter(function (f) {
      return f.section === section && Number(f.semester) === semester;
    });

    var byFaculty = {};
    entries.forEach(function (e) { (byFaculty[e.facultyId] = byFaculty[e.facultyId] || []).push(e); });

    var rows = Object.keys(byFaculty).map(function (fid) {
      var fac = facultyById(fid);
      var list = byFaculty[fid];
      var n = list.length;
      var avg = function (key) { return list.reduce(function (s, e) { return s + (e[key] || 0); }, 0) / n; };
      return {
        name: fac ? fac.name : "(removed faculty)",
        n: n,
        academic: avg("academicSum"), discipline: avg("disciplineSum"), attitude: avg("attitudeSum"), total: avg("total")
      };
    }).sort(function (a, b) { return a.name < b.name ? -1 : 1; });

    var overallN = entries.length;
    var overallAvg = function (key) { return overallN ? entries.reduce(function (s, e) { return s + (e[key] || 0); }, 0) / overallN : 0; };

    var body = document.getElementById("report-body");
    body.innerHTML =
      '<div class="report-toolbar"><button type="button" class="ghost" id="print-report-btn">Print / Save as PDF</button></div>' +
      '<div id="report-print-area">' +
        '<div class="report-head">' +
          '<div><h2>' + escapeHtml(REPORT_DEPT) + ' — Semester ' + semester + ', Section ' + escapeHtml(section) + '</h2>' +
          '<div class="report-sub">Section-wise FCI Score report</div></div>' +
          '<div class="report-gen">Generated ' + new Date().toLocaleString() + '</div>' +
        '</div>' +
        '<table class="report-table">' +
          '<thead><tr><th>Faculty</th><th class="num">Responses</th><th class="num">Academics /50</th><th class="num">Discipline /30</th><th class="num">Attitude /20</th><th class="num">FCI Score /100</th></tr></thead>' +
          '<tbody>' + (rows.length ? rows.map(function (r) {
            return '<tr><td>' + escapeHtml(r.name) + '</td><td class="num">' + r.n + '</td><td class="num">' + r.academic.toFixed(1) + '</td><td class="num">' + r.discipline.toFixed(1) + '</td><td class="num">' + r.attitude.toFixed(1) + '</td><td class="num total">' + r.total.toFixed(1) + '</td></tr>';
          }).join("") : '<tr><td colspan="6" style="color:var(--ink-faint);">No responses.</td></tr>') + '</tbody>' +
          '<tfoot><tr><td>Section average</td><td class="num">' + overallN + '</td><td class="num">' + overallAvg("academicSum").toFixed(1) + '</td><td class="num">' + overallAvg("disciplineSum").toFixed(1) + '</td><td class="num">' + overallAvg("attitudeSum").toFixed(1) + '</td><td class="num total">' + overallAvg("total").toFixed(1) + '</td></tr></tfoot>' +
        '</table>' +
      '</div>';

    document.getElementById("print-report-btn").addEventListener("click", function () { window.print(); });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  boot();
})();
