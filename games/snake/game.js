(function () {
  var GAME_ID = "snake";
  var CELLS = 20;
  var STEP_MS = 110;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var cell = canvas.width / CELLS;
  var scoreEl = document.getElementById("score");
  var scoresEl = document.getElementById("scores");

  var snake, dir, nextDir, food, score, state, acc, last;

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    acc = 0;
    placeFood();
    scoreEl.textContent = score;
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * CELLS), y: Math.floor(Math.random() * CELLS) };
    } while (snake.some(function (s) { return s.x === food.x && s.y === food.y; }));
  }

  function turn(x, y) {
    // Disallow reversing into yourself.
    if (x === -dir.x && y === -dir.y) return;
    nextDir = { x: x, y: y };
  }

  function step() {
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    var hitWall = head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS;
    var hitSelf = snake.some(function (s) { return s.x === head.x && s.y === head.y; });
    if (hitWall || hitSelf) return gameOver();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
  }

  function gameOver() {
    state = "over";
    if (score > 0) Scores.add(GAME_ID, score);
    Scores.render(GAME_ID, scoresEl);
  }

  function start() {
    reset();
    state = "playing";
  }

  function text(msg, y, size) {
    ctx.fillStyle = "#39ff88";
    ctx.font = "bold " + size + "px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(msg, canvas.width / 2, y);
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ff3cac";
    ctx.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4);

    snake.forEach(function (s, i) {
      ctx.fillStyle = i === 0 ? "#2de2ff" : "#39ff88";
      ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
    });

    if (state === "ready") {
      text("SNAKE", 180, 40);
      text("Press Space or tap", 220, 18);
    } else if (state === "over") {
      text("GAME OVER", 180, 40);
      text("Score " + score + " - Space or tap", 220, 18);
    }
  }

  function frame(t) {
    var dt = t - (last || t);
    last = t;
    if (state === "playing") {
      acc += dt;
      while (acc >= STEP_MS && state === "playing") {
        acc -= STEP_MS;
        step();
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  var KEYS = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0]
  };

  window.addEventListener("keydown", function (e) {
    if (e.key === " ") {
      e.preventDefault();
      if (state !== "playing") start();
      return;
    }
    var k = KEYS[e.key];
    if (k) {
      e.preventDefault();
      turn(k[0], k[1]);
    }
  });

  // Touch: tap to start, swipe to steer.
  var touchStart = null;
  canvas.addEventListener("touchstart", function (e) {
    var t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
    if (state !== "playing") start();
  }, { passive: true });
  canvas.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
  }, { passive: true });
  canvas.addEventListener("click", function () { if (state !== "playing") start(); });

  reset();
  state = "ready";
  Scores.render(GAME_ID, scoresEl);
  requestAnimationFrame(frame);
})();
