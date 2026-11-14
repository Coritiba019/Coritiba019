#!/usr/bin/env node
/**
 * Gera assets/pacman.svg e assets/pacman-dark.svg: um Pac-Man percorrendo o
 * gráfico de contribuições do último ano, comendo os dias com commits,
 * com dois fantasmas atrás. Sem dependências (Node 18+).
 *
 * Uso: GITHUB_TOKEN=... node scripts/pacman.mjs [usuario]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const user = process.argv[2] || process.env.GITHUB_USER || "Coritiba019";
const token =
  process.env.GITHUB_TOKEN ||
  (() => { try { return execSync("gh auth token", { encoding: "utf8" }).trim(); } catch { return ""; } })();
if (!token) throw new Error("Defina GITHUB_TOKEN (ou faça login no gh).");

const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount date weekday}}}}}}`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-pacman" },
  body: JSON.stringify({ query, variables: { login: user } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
const cal = json.data.user.contributionsCollection.contributionCalendar;

// grade[semana][dia da semana] = quantidade (dias futuros ficam null)
const weeks = cal.weeks.map((w) => {
  const col = Array(7).fill(null);
  for (const d of w.contributionDays) col[d.weekday] = d.contributionCount;
  return col;
});

const counts = weeks.flat().filter((c) => c > 0).sort((a, b) => a - b);
const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] ?? 1;
const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
const level = (c) => (!c ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);

const CELL = 11, GAP = 3, STEP = CELL + GAP, PAD_X = 24, PAD_TOP = 40, PAD_BOTTOM = 34;
const W = PAD_X * 2 + weeks.length * STEP - GAP;
const H = PAD_TOP + 7 * STEP - GAP + PAD_BOTTOM;
const cx = (w) => PAD_X + w * STEP + CELL / 2;
const cy = (d) => PAD_TOP + d * STEP + CELL / 2;

// Caminho em zigue-zague: desce numa semana, sobe na seguinte.
const path = [];
weeks.forEach((col, w) => {
  const days = w % 2 === 0 ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
  for (const d of days) path.push([w, d]);
});
const SECONDS_PER_CELL = 0.09;
const DUR = +(path.length * SECONDS_PER_CELL).toFixed(2);
const motion = "M" + path.map(([w, d]) => `${cx(w)} ${cy(d)}`).join(" L");
const order = new Map(path.map(([w, d], i) => [`${w}:${d}`, i]));

const THEMES = {
  light: { bg: "#ffffff", text: "#57606a", empty: "#ebedf0", levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] },
  dark: { bg: "#0d1117", text: "#8b949e", empty: "#161b22", levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"] },
};

const PAC_OPEN = "M0 0 L6.5 -3.8 A7.5 7.5 0 1 0 6.5 3.8 Z";
const PAC_SHUT = "M0 0 L7.5 -0.2 A7.5 7.5 0 1 0 7.5 0.2 Z";
const ghost = (color, delay) => `
  <g visibility="hidden">
    <set attributeName="visibility" to="visible" begin="${delay}s"/>
    <animateMotion dur="${DUR}s" begin="${delay}s" repeatCount="indefinite" path="${motion}"/>
    <path d="M-6 6 V-1 A6 6 0 0 1 6 -1 V6 L4 4 L2 6 L0 4 L-2 6 L-4 4 Z" fill="${color}"/>
    <circle cx="-2.3" cy="-1.5" r="1.9" fill="#fff"/><circle cx="2.3" cy="-1.5" r="1.9" fill="#fff"/>
    <circle cx="-1.8" cy="-1.3" r="0.9" fill="#1f2328"/><circle cx="2.8" cy="-1.3" r="0.9" fill="#1f2328"/>
  </g>`;

function render(t) {
  const cells = [];
  weeks.forEach((col, w) =>
    col.forEach((c, d) => {
      if (c === null) return;
      const fill = t.levels[level(c)];
      const x = PAD_X + w * STEP, y = PAD_TOP + d * STEP;
      if (!c) {
        cells.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"/>`);
        return;
      }
      // o dia some quando o Pac-Man passa e volta no recomeço da volta
      const k = (order.get(`${w}:${d}`) / path.length).toFixed(4);
      const k2 = Math.min(0.9999, +k + 0.002).toFixed(4);
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}">` +
          `<animate attributeName="fill" dur="${DUR}s" repeatCount="indefinite" calcMode="discrete" values="${fill};${t.empty};${t.empty}" keyTimes="0;${k2};1"/></rect>`,
      );
    }),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pac-Man comendo o gráfico de contribuições de ${user}">
  <rect width="${W}" height="${H}" rx="10" fill="${t.bg}"/>
  <text x="${PAD_X}" y="25" font-family="'Segoe UI', Ubuntu, Arial, sans-serif" font-size="13" fill="${t.text}">${cal.totalContributions.toLocaleString("pt-BR")} contribuições no último ano</text>
  ${cells.join("\n  ")}
  ${ghost("#ff5f5f", (SECONDS_PER_CELL * 9).toFixed(2))}
  ${ghost("#5fd3ff", (SECONDS_PER_CELL * 18).toFixed(2))}
  <g>
    <animateMotion dur="${DUR}s" repeatCount="indefinite" rotate="auto" path="${motion}"/>
    <path d="${PAC_OPEN}" fill="#facc15">
      <animate attributeName="d" dur="0.28s" repeatCount="indefinite" values="${PAC_OPEN};${PAC_SHUT};${PAC_OPEN}"/>
    </path>
  </g>
  <g font-family="'Segoe UI', Ubuntu, Arial, sans-serif" font-size="11" fill="${t.text}">
    <text x="${W - PAD_X - 150}" y="${H - 12}">menos</text>
    ${t.levels.map((c, i) => `<rect x="${W - PAD_X - 112 + i * 15}" y="${H - 22}" width="11" height="11" rx="2" fill="${c}"/>`).join("")}
    <text x="${W - PAD_X - 34}" y="${H - 12}">mais</text>
  </g>
</svg>
`;
}

mkdirSync("assets", { recursive: true });
writeFileSync("assets/pacman.svg", render(THEMES.light));
writeFileSync("assets/pacman-dark.svg", render(THEMES.dark));
console.log(`ok: ${cal.totalContributions} contribuições, ${path.length} dias, volta de ${DUR}s`);
