# Ben's Arcade

A free, static site of small browser games. No build step, no backend.

## Run locally

`games.json` is loaded with `fetch`, so open the site through a local server (not by double-clicking `index.html`):

```
python -m http.server 8000
```

Then visit http://localhost:8000.

## Add a game

1. Create `games/<your-id>/` with an `index.html`, a `game.js` and a `thumb.svg` (a 4:3 image).
2. In `index.html`, include `../../js/scores.js` and set the `<title>`, HUD label and hint text.
3. In `game.js`, set `GAME_ID` to `<your-id>`. Call `Scores.add(GAME_ID, score)` on game over and `Scores.render(GAME_ID, listElement)` to show the table.
4. Add an entry to `games.json`:
   ```json
   { "id": "your-id", "title": "Title", "description": "One line.", "thumb": "games/your-id/thumb.svg", "path": "games/your-id/" }
   ```

Use relative paths everywhere so the site works under a GitHub Pages repo subpath.

## Deploy (GitHub Pages)

1. Create a GitHub repo and push this folder to `main`.
2. Repo Settings > Pages > Deploy from branch > `main` / root.
3. The site appears at `https://<user>.github.io/<repo>/`.

## High scores

Stored per game in the player's browser (`localStorage`, key `arcade:<id>`). They are local only and not shared between players.
