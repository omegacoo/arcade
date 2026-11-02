(function () {
  // Web3Forms access keys are public by design; the destination email stays on their side.
  var ACCESS_KEY = "d3c711f4-1e14-443f-bc8d-da42aa864e55";
  var ENDPOINT = "https://api.web3forms.com/submit";
  var MIN = 10, MAX = 2000;

  var form = document.getElementById("feedback");
  var topic = document.getElementById("topic");
  var message = document.getElementById("message");
  var reply = document.getElementById("reply");
  var botcheck = document.getElementById("botcheck");
  var send = document.getElementById("send");
  var result = document.getElementById("result");
  var count = document.getElementById("count");

  function clean(text) {
    return text
      .replace(/<[^>]*>/g, "")                       // strip HTML tags
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // control chars
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function say(text, ok) {
    result.textContent = text;
    result.className = "msg " + (ok ? "ok" : "err");
  }

  message.addEventListener("input", function () { count.textContent = message.value.length; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (botcheck.checked) return; // bot: silently drop

    var text = clean(message.value);
    if (!topic.value) return say("Please choose a topic.", false);
    if (text.length < MIN) return say("Please write at least " + MIN + " characters.", false);
    if (text.length > MAX) return say("Please keep it under " + MAX + " characters.", false);
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|top|info|biz|co)\b/i.test(text)) {
      return say("Links aren't accepted. Please describe it in words.", false);
    }
    var email = reply.value.trim();
    if (email && !reply.checkValidity()) return say("That email address doesn't look right.", false);

    send.disabled = true;
    say("Sending...", true);

    var payload = {
      access_key: ACCESS_KEY,
      subject: "[Arcade] " + topic.value,
      from_name: "Ben's Arcade feedback",
      topic: topic.value,
      message: text,
      botcheck: ""
    };
    if (email) payload.email = email;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) throw new Error(data.message);
        form.reset();
        count.textContent = "0";
        say("Thanks! Your feedback was sent.", true);
      })
      .catch(function () { say("Something went wrong. Please try again later.", false); })
      .then(function () { send.disabled = false; });
  });
})();
