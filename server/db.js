// Tiny JSON-file datastore. No native modules (sqlite3/better-sqlite3) so
// there's nothing to compile — just `npm install express` and run.
// Fine for a class-project scale (hundreds of faculty, a few thousand
// feedback rows). The whole file is read once at startup, mutated in
// memory, and rewritten to disk after each change.

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data.json");

function emptyState() {
  return { faculty: [], feedback: [], nextFacultyId: 1, nextFeedbackId: 1 };
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    const state = emptyState();
    save(state);
    return state;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    // backfill in case of a partially-shaped file
    return Object.assign(emptyState(), parsed);
  } catch (e) {
    console.error("Could not read/parse server/data.json — starting fresh.", e.message);
    return emptyState();
  }
}

function save(state) {
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
}

module.exports = { load, save };
