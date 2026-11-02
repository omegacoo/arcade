// Shared local high-score helper. Scores live in the player's browser only.
// Usage: Scores.add("snake", 120); Scores.get("snake"); Scores.render("snake", listElement);
window.Scores = (function () {
  var MAX = 10;

  function key(id) { return "arcade:" + id; }

  function get(id) {
    try {
      var list = JSON.parse(localStorage.getItem(key(id)) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function add(id, score) {
    var list = get(id);
    list.push({ score: score, date: new Date().toISOString().slice(0, 10) });
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, MAX);
    try { localStorage.setItem(key(id), JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
    return list;
  }

  function render(id, ol) {
    var list = get(id);
    ol.textContent = "";
    if (!list.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No scores yet";
      ol.appendChild(li);
      return;
    }
    list.forEach(function (s) {
      var li = document.createElement("li");
      li.textContent = s.score + "  (" + s.date + ")";
      ol.appendChild(li);
    });
  }

  return { get: get, add: add, render: render };
})();
