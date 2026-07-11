# Mosaic Palette Editor — deploy

One-time setup
1. Create an empty Git repo (GitHub/GitLab). Push these files to it:
   git init && git add -A && git commit -m "init" && git branch -M main
   git remote add origin <YOUR_REPO_URL> && git push -u origin main
2. On Infomaniak: Web Hosting > your Node.js site > Manage advanced settings > Node.js:
   - Set the Git repository to <YOUR_REPO_URL> (or clone it into the site root via SSH).
   - Build command: git pull && npm install   (npm install only needed if deps change; this app has none)
   - Start command: npm start    Execution folder: ./
3. Save, then Restart the app from the site dashboard.

Each update from now on
- I hand you a new index.html (and rarely server.js).
- Replace the file in your local clone, then:
   git add -A && git commit -m "update" && git push
- On Infomaniak: run the Build (git pull) then Restart. Done — no zip, no rebuild.

Notes
- palettes/ holds runtime data and is gitignored; it is never overwritten by a deploy.
- node_modules/ is gitignored; this app has zero dependencies so you can leave it empty.
