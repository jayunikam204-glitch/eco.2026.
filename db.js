const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "ecocare.db");
const seedPath = path.join(__dirname, "questions.json");

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    options_json TEXT NOT NULL,
    answer_index INTEGER NOT NULL,
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    selected_index INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (attempt_id, question_id),
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );
`);

function seedQuestions() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM questions").get().total;
  if (count > 0) return;

  const questions = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const insert = db.prepare(`
    INSERT INTO questions (prompt, options_json, answer_index, sort_order)
    VALUES (?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    questions.forEach((item, index) => {
      insert.run(
        item.prompt,
        JSON.stringify(item.options),
        item.answerIndex,
        index + 1
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

seedQuestions();

function listQuestions() {
  return db
    .prepare(
      "SELECT id, prompt, options_json, sort_order FROM questions ORDER BY sort_order ASC"
    )
    .all()
    .map((row) => ({
      id: row.id,
      q: `${row.sort_order}. ${row.prompt}`,
      options: JSON.parse(row.options_json)
    }));
}

function getQuestion(id) {
  return db
    .prepare(
      "SELECT id, prompt, options_json, answer_index, sort_order FROM questions WHERE id = ?"
    )
    .get(id);
}

function questionCount() {
  return db.prepare("SELECT COUNT(*) AS total FROM questions").get().total;
}

function createAttempt(playerName) {
  const total = questionCount();
  const result = db
    .prepare(
      "INSERT INTO quiz_attempts (player_name, score, total, completed) VALUES (?, 0, ?, 0)"
    )
    .run(playerName, total);
  return { id: Number(result.lastInsertRowid), total };
}

function getAttempt(id) {
  return db.prepare("SELECT * FROM quiz_attempts WHERE id = ?").get(id);
}

function saveAnswer(attemptId, questionId, selectedIndex) {
  const attempt = getAttempt(attemptId);
  if (!attempt) {
    return { error: "Quiz attempt not found.", status: 404 };
  }
  if (attempt.completed) {
    return { error: "This quiz is already completed.", status: 400 };
  }

  const question = getQuestion(questionId);
  if (!question) {
    return { error: "Question not found.", status: 404 };
  }

  const options = JSON.parse(question.options_json);
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= options.length
  ) {
    return { error: "Invalid answer choice.", status: 400 };
  }

  const existing = db
    .prepare(
      "SELECT id FROM quiz_answers WHERE attempt_id = ? AND question_id = ?"
    )
    .get(attemptId, questionId);
  if (existing) {
    return { error: "This question was already answered.", status: 400 };
  }

  const isCorrect = selectedIndex === question.answer_index ? 1 : 0;

  db.exec("BEGIN");
  let progress;
  try {
    db.prepare(
      `
      INSERT INTO quiz_answers (attempt_id, question_id, selected_index, is_correct)
      VALUES (?, ?, ?, ?)
    `
    ).run(attemptId, questionId, selectedIndex, isCorrect);

    const score = db
      .prepare(
        "SELECT COUNT(*) AS total FROM quiz_answers WHERE attempt_id = ? AND is_correct = 1"
      )
      .get(attemptId).total;
    const answered = db
      .prepare("SELECT COUNT(*) AS total FROM quiz_answers WHERE attempt_id = ?")
      .get(attemptId).total;
    const completed = answered >= attempt.total ? 1 : 0;

    db.prepare(
      "UPDATE quiz_attempts SET score = ?, completed = ? WHERE id = ?"
    ).run(score, completed, attemptId);

    progress = { score, answered, completed: Boolean(completed) };
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    correct: Boolean(isCorrect),
    correctIndex: question.answer_index,
    correctText: options[question.answer_index],
    score: progress.score,
    answered: progress.answered,
    total: attempt.total,
    completed: progress.completed
  };
}

function listAttempts(limit = 10) {
  return db
    .prepare(
      `
      SELECT id, player_name, score, total, completed, created_at
      FROM quiz_attempts
      WHERE id IN (SELECT DISTINCT attempt_id FROM quiz_answers)
      ORDER BY id DESC
      LIMIT ?
    `
    )
    .all(limit)
    .map((row) => ({
      id: row.id,
      name: row.player_name,
      score: row.score,
      total: row.total,
      completed: Boolean(row.completed),
      createdAt: row.created_at
    }));
}

module.exports = {
  listQuestions,
  createAttempt,
  saveAnswer,
  listAttempts
};
