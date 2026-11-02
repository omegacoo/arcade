(function () {
  var grid = document.getElementById("games");
  var status = document.getElementById("status");

  function card(game) {
    var a = document.createElement("a");
    a.className = "card";
    a.href = game.path;

    var img = document.createElement("img");
    img.src = game.thumb;
    img.alt = "";
    img.loading = "lazy";

    var body = document.createElement("div");
    body.className = "body";
    var h = document.createElement("h2");
    h.textContent = game.title;
    var p = document.createElement("p");
    p.textContent = game.description;
    body.appendChild(h);
    body.appendChild(p);

    a.appendChild(img);
    a.appendChild(body);
    return a;
  }

  fetch("games.json")
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (games) {
      if (!games.length) {
        status.textContent = "No games yet. Check back soon!";
        return;
      }
      games.forEach(function (g) { grid.appendChild(card(g)); });
      status.hidden = true;
    })
    .catch(function () {
      status.textContent = "Could not load the game list. (If opening the file directly, run a local server instead.)";
    });

  var stamp = document.getElementById("updated");
  fetch("updated.txt", { cache: "no-cache" })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var d = new Date(t.trim());
      stamp.textContent = isNaN(d) ? "unknown" : d.toLocaleString();
      stamp.dateTime = d.toISOString();
    })
    .catch(function () { stamp.textContent = "unknown"; });
})();
