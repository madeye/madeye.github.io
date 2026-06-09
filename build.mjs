#!/usr/bin/env node
// Snapshots GitHub profile + repos into a fully static index.html.
// Runs server-side (GitHub Actions) so the published page makes zero
// GitHub API calls at view time — no rate limits, works offline.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const USER = "madeye";
// Org repos to surface alongside the user's own projects.
const EXTRA_REPOS = [
  "shadowsocks/shadowsocks-libev",
  "shadowsocks/shadowsocks-android",
  "shadowsocks/shadowsocks-org",
];

const LANG_COLORS = {
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  CSS: "#563d7c",
  Dart: "#00B4AB",
  Go: "#00ADD8",
  HTML: "#e34c26",
  Java: "#b07219",
  JavaScript: "#f1e05a",
  Kotlin: "#A97BFF",
  Lua: "#000080",
  "Objective-C": "#438eff",
  Python: "#3572A5",
  Ruby: "#701516",
  Rust: "#dea584",
  Shell: "#89e051",
  Swift: "#F05138",
  TypeScript: "#3178c6",
  Vim: "#199f4b",
  Makefile: "#427819",
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeAgo(dateStr, now) {
  const diff = now - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  const months = Math.floor(days / 30);
  if (months < 12) return months + (months === 1 ? " month ago" : " months ago");
  const years = Math.floor(days / 365);
  return years + (years === 1 ? " year ago" : " years ago");
}

async function fetchJSON(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "madeye.github.io-snapshot",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

function renderProfile(u) {
  const blog = u.blog
    ? `<span><a href="${escapeHtml(u.blog.startsWith("http") ? u.blog : "https://" + u.blog)}">${escapeHtml(u.blog)}</a></span>`
    : "";
  return `
      <a href="${escapeHtml(u.html_url)}"><img src="${escapeHtml(u.avatar_url)}" alt="${escapeHtml(u.name || u.login)}"></a>
      <div class="profile-info">
        <h1>${escapeHtml(u.name || u.login)}</h1>
        ${u.bio ? `<p class="bio">${escapeHtml(u.bio)}</p>` : ""}
        <div class="profile-meta">
          ${u.company ? `<span>${escapeHtml(u.company)}</span>` : ""}
          ${u.location ? `<span>${escapeHtml(u.location)}</span>` : ""}
          ${blog}
          <span><a href="${escapeHtml(u.html_url)}">@${escapeHtml(u.login)}</a></span>
        </div>
      </div>`;
}

const STAR_ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"></path></svg>';

function renderRepo(r, now) {
  const langColor = LANG_COLORS[r.language] || "#8b949e";
  // Strong highlight for repos with 10k+ stars.
  const hot = r.stargazers_count >= 10000 ? " hot" : "";
  return `<a href="${escapeHtml(r.html_url)}" class="repo-card" style="text-decoration:none;color:inherit">
        <h3>${escapeHtml(r.full_name)}</h3>
        ${r.description ? `<p class="desc">${escapeHtml(r.description)}</p>` : `<p class="desc" style="opacity:0.5">No description</p>`}
        <div class="repo-meta">
          ${r.language ? `<span><span class="lang-dot" style="background:${langColor}"></span>${escapeHtml(r.language)}</span>` : ""}
          <span class="stars${hot}">${STAR_ICON}${r.stargazers_count.toLocaleString("en-US")}</span>
          <span>Updated ${timeAgo(r.updated_at, now)}</span>
        </div>
      </a>`;
}

async function main() {
  const now = Date.now();

  const [profile, personal, ...extras] = await Promise.all([
    fetchJSON(`https://api.github.com/users/${USER}`),
    fetchJSON(`https://api.github.com/users/${USER}/repos?per_page=100`),
    ...EXTRA_REPOS.map((slug) => fetchJSON(`https://api.github.com/repos/${slug}`)),
  ]);

  const nonForks = personal.filter((r) => !r.fork);
  const all = [...nonForks, ...extras];

  // Deduplicate by repo name, preferring the more-starred copy.
  const seen = new Map();
  for (const r of all) {
    const key = r.name.toLowerCase();
    const existing = seen.get(key);
    if (!existing || r.stargazers_count > existing.stargazers_count) {
      seen.set(key, r);
    }
  }

  const repos = [...seen.values()].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );

  const generatedAt = new Date(now).toISOString().slice(0, 10);

  const template = await readFile(join(__dirname, "template.html"), "utf8");
  const html = template
    .replace("{{PROFILE}}", renderProfile(profile))
    .replace("{{REPOS}}", repos.map((r) => renderRepo(r, now)).join("\n"))
    .replace("{{GENERATED_AT}}", generatedAt);

  await writeFile(join(__dirname, "index.html"), html);
  console.log(`Wrote index.html — ${repos.length} repos, snapshot ${generatedAt}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
