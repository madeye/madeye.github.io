# madeye.github.io

Personal landing page listing my open-source projects.

Rather than calling the GitHub API from the browser (which hits rate limits
and fails for anonymous visitors), this site is **snapshotted into a fully
static page once a day** by a GitHub Actions workflow. The published page makes
zero API calls at view time.

## How it works

- **`template.html`** — the static shell (markup + CSS) with `{{PROFILE}}`,
  `{{REPOS}}`, and `{{GENERATED_AT}}` placeholders.
- **`build.mjs`** — fetches my profile and repos from the GitHub API
  server-side, then renders `template.html` into a complete `index.html`.
- **`.github/workflows/snapshot.yml`** — runs `build.mjs` daily (and on every
  push to `main`), then force-pushes the generated `index.html` to the
  **`gh-pages`** branch.

`main` holds only the sources; the generated `index.html` lives on `gh-pages`,
so the source branch never gets dirtied by snapshots.

## Local preview

```sh
GITHUB_TOKEN=$(gh auth token) node build.mjs
open index.html
```

(`index.html` is gitignored — it is a build artifact.)

## Pages configuration

GitHub Pages is served from the **`gh-pages`** branch, root path.
