function startQuiz() {
  const questionEl = document.getElementById("question");
  const optionsEl = document.getElementById("options");
  const feedbackEl = document.getElementById("feedback");
  const scoreEl = document.getElementById("score");
  const nextBtn = document.getElementById("next-btn");
  const restartBtn = document.getElementById("restart-btn");
  const nameInput = document.getElementById("player-name");
  const resultsList = document.getElementById("results-list");
  const resultsEmpty = document.getElementById("results-empty");

  if (!questionEl || !optionsEl || !feedbackEl || !scoreEl || !nextBtn || !restartBtn) {
    console.error("Quiz HTML elements are missing. Check Index.html.");
    return;
  }

  let questions = [];
  let current = 0;
  let score = 0;
  let answered = false;
  let attemptId = null;

  function playerName() {
    return (nameInput && nameInput.value.trim()) || "Guest";
  }

  async function loadQuestions() {
    const response = await fetch("/api/questions");
    if (!response.ok) {
      throw new Error("Could not load questions.");
    }
    const data = await response.json();
    questions = data.questions || [];
    if (!questions.length) {
      throw new Error("No questions found in the database.");
    }
  }

  async function ensureAttempt() {
    if (attemptId) return;
    const response = await fetch("/api/quiz/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: playerName() })
    });
    if (!response.ok) {
      throw new Error("Could not start quiz.");
    }
    const data = await response.json();
    attemptId = data.attemptId;
  }

  async function loadResults() {
    if (!resultsList || !resultsEmpty) return;

    try {
      const response = await fetch("/api/quiz/attempts");
      if (!response.ok) return;
      const data = await response.json();
      const attempts = data.attempts || [];

      resultsList.replaceChildren();
      if (!attempts.length) {
        resultsEmpty.hidden = false;
        return;
      }

      resultsEmpty.hidden = true;
      attempts.forEach((attempt) => {
        const item = document.createElement("li");
        const status = attempt.completed ? "completed" : "in progress";
        item.textContent = `${attempt.name}: ${attempt.score} / ${attempt.total} (${status})`;
        resultsList.appendChild(item);
      });
    } catch (error) {
      console.error(error);
    }
  }

  function showQuestion() {
    answered = false;
    const item = questions[current];

    questionEl.textContent = item.q;
    optionsEl.replaceChildren();
    feedbackEl.textContent = "";
    nextBtn.hidden = true;
    restartBtn.hidden = true;

    item.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.textContent = option;

      button.addEventListener("click", async () => {
        if (answered) return;
        answered = true;

        const buttons = optionsEl.querySelectorAll("button");
        buttons.forEach((b) => {
          b.disabled = true;
        });

        try {
          await ensureAttempt();
          const response = await fetch("/api/quiz/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              attemptId,
              questionId: item.id,
              selectedIndex: index
            })
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Could not save answer.");
          }

          score = result.score;
          if (result.correct) {
            button.classList.add("correct");
            feedbackEl.textContent = "Correct! Well done. Saved to database.";
          } else {
            button.classList.add("incorrect");
            buttons[result.correctIndex].classList.add("correct");
            feedbackEl.textContent =
              "Incorrect. Correct answer: " + result.correctText + ". Saved to database.";
          }

          scoreEl.textContent = "Score: " + score + " / " + questions.length;

          loadResults();

          if (current < questions.length - 1) {
            nextBtn.hidden = false;
          } else {
            questionEl.textContent = "Quiz Completed!";
            feedbackEl.textContent +=
              " Final score: " + score + " out of " + questions.length + ".";
            restartBtn.hidden = false;
          }
        } catch (error) {
          answered = false;
          buttons.forEach((b) => {
            b.disabled = false;
          });
          feedbackEl.textContent = error.message;
        }
      });

      optionsEl.appendChild(button);
    });

    scoreEl.textContent =
      "Question " + (current + 1) + " of " + questions.length + " | Score: " + score + " / " + questions.length;
  }

  async function beginQuiz() {
    current = 0;
    score = 0;
    attemptId = null;
    questionEl.textContent = "Loading question...";
    optionsEl.replaceChildren();
    feedbackEl.textContent = "";
    nextBtn.hidden = true;
    restartBtn.hidden = true;

    try {
      await loadQuestions();
      showQuestion();
    } catch (error) {
      questionEl.textContent = "Quiz unavailable";
      feedbackEl.textContent =
        error.message + " Start the server with npm start, then refresh this page.";
    }
  }

  nextBtn.addEventListener("click", () => {
    if (!answered || current >= questions.length - 1) return;
    current++;
    showQuestion();
  });

  restartBtn.addEventListener("click", () => {
    beginQuiz();
  });

  beginQuiz();
  loadResults();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startQuiz);
} else {
  startQuiz();
}
