const path = require("path");
const express = require("express");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

app.use(express.json());
app.use(express.static(publicDir));

function cleanName(value) {
  const name = String(value || "").trim().slice(0, 40);
  return name || "Guest";
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "Index.html"));
});

app.get("/api/questions", (_req, res) => {
  res.json({ questions: db.listQuestions() });
});

app.post("/api/quiz/start", (req, res) => {
  const attempt = db.createAttempt(cleanName(req.body && req.body.name));
  res.status(201).json({
    attemptId: attempt.id,
    total: attempt.total
  });
});

app.post("/api/quiz/answer", (req, res) => {
  const attemptId = Number(req.body && req.body.attemptId);
  const questionId = Number(req.body && req.body.questionId);
  const selectedIndex = Number(req.body && req.body.selectedIndex);

  if (!Number.isInteger(attemptId) || !Number.isInteger(questionId)) {
    res.status(400).json({ error: "attemptId and questionId are required." });
    return;
  }

  const result = db.saveAnswer(attemptId, questionId, selectedIndex);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json(result);
});

app.get("/api/quiz/attempts", (_req, res) => {
  res.json({ attempts: db.listAttempts() });
});

app.listen(PORT, () => {
  console.log(`EcoCare server running at http://localhost:${PORT}`);
});
