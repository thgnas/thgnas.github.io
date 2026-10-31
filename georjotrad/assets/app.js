/* GEORJOTRAD — interface (lit les JSON produits par le moteur Python dans data/). */
"use strict";

const REPO = "https://github.com/thgnas/GEORJOTRAD";
const LC = window.LightweightCharts;
const app = document.getElementById("app");

let SCAN = null;
let PF = null;
const assetCache = {};
let charts = [];

// ------------------------------------------------------------------ utilitaires

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (v) => typeof v === "number" && isFinite(v);
const zero = (v, d) => Math.abs(v) < 0.5 * 10 ** -d ? 0 : v;
const num = (v, d = 2) => isNum(v) ? zero(v, d).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const eur = (v, d = 2) => isNum(v) ? num(v, d) + " €" : "—";
const pct = (v, d = 1, sign = true) => isNum(v) ? (sign && zero(v * 100, d) > 0 ? "+" : "") + zero(v * 100, d).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " %" : "—";
const prob = (v) => isNum(v) ? Math.round(v * 100) + " %" : "—";
const cls = (v) => !isNum(v) || v === 0 ? "" : v > 0 ? "up" : "down";
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const safeName = (t) => t.replace("^", "_");
const store = {
  get(k, d) { try { const v = localStorage.getItem("gj." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("gj." + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

const BADGES = { "ACHAT FORT": "b-af", "ACHAT": "b-a", "NEUTRE": "b-n", "ALLÉGER": "b-al", "ÉVITER": "b-e" };
const badge = (label) => `<span class="badge ${BADGES[label] || "b-n"}">${esc(label)}</span>`;
const scoreColor = (s) => s >= 62 ? "var(--up)" : s >= 45 ? "var(--accent)" : s >= 30 ? "var(--warn)" : "var(--down)";
const ring = (s, size = "") => `<div class="ring ${size}" style="--p:${Math.round(s)};--ring-c:${scoreColor(s)}"><span>${Math.round(s)}</span></div>`;
const isBuy = (r) => r.label === "ACHAT" || r.label === "ACHAT FORT";
const assetLink = (t) => `#/actif/${encodeURIComponent(t)}`;

function fmtDate(iso, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  const o = { day: "2-digit", month: "2-digit", year: "numeric" };
  if (withTime && iso.length > 10) Object.assign(o, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("fr-FR", o);
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path} : HTTP ${r.status}`);
  return r.json();
}

async function getAsset(ticker) {
  if (!assetCache[ticker]) assetCache[ticker] = getJSON(`data/assets/${encodeURIComponent(safeName(ticker))}.json`);
  return assetCache[ticker];
}

function sparkline(values, w = 220, h = 48) {
  const v = values.filter(isNum);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - lo) / span * (h - 4)).toFixed(1)}`).join(" ");
  const col = v[v.length - 1] >= v[0] ? "var(--up)" : "var(--down)";
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

// ------------------------------------------------------------------ renseignement de marché

const fgColor = (v) => v < 25 ? "var(--down)" : v < 45 ? "var(--warn)" : v < 55 ? "var(--muted)" : "var(--up)";
const FG_COMP = { momentum: "Élan du CAC 40", largeur: "Largeur du marché", plus_hauts: "Plus hauts vs plus bas", force: "Hausse médiane 1 mois",
  volatilite: "Volatilité (VIX)", valeur_refuge: "Actions vs or" };

function fgScale(v) {
  return `<div class="fg-scale"><span style="background:var(--down)"></span><span style="background:var(--warn)"></span><span style="background:var(--grid)"></span>
    <span style="background:color-mix(in srgb, var(--up) 60%, transparent)"></span><span style="background:var(--up)"></span>
    <i style="left:${Math.max(0, Math.min(100, v))}%"></i></div>
    <div class="fg-legend"><span>Peur extrême</span><span>Neutre</span><span>Avidité extrême</span></div>`;
}

function briefCard() {
  const b = SCAN.brief;
  if (!b) return "";
  return `<div class="card mb brief"><h2>🧭 Le brief du jour <span class="muted" style="font-weight:500;font-size:12px">· rédigé automatiquement par le robot à partir de toutes les sources</span></h2>
    ${b.paragraphes.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
}

function sentimentCard() {
  const f = SCAN.sentiment;
  if (!f) return "";
  const delta = (v, l) => isNum(v) ? `<span><span class="muted">${l}</span> <b class="num" style="color:${fgColor(v)}">${Math.round(v)}</b></span>` : "";
  return `<div class="card"><h2>🌡️ Baromètre peur / avidité</h2>
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
      <span class="num" style="font-size:34px;font-weight:800;color:${fgColor(f.score)}">${Math.round(f.score)}</span>
      <b style="font-size:16px;color:${fgColor(f.score)}">${esc(f.label)}</b>
      <span class="muted" style="margin-left:auto;display:flex;gap:10px;font-size:12px">${delta(f.semaine, "1 sem.")}${delta(f.mois, "1 mois")}${delta(f.an, "1 an")}</span>
    </div>
    ${fgScale(f.score)}
    <div class="mt">${Object.entries(f.composantes).map(([k, v]) => `<div class="bar"><span>${FG_COMP[k] || k}</span>
      <div class="track"><div class="fill" style="width:${v}%;background:${fgColor(v)}"></div></div><span class="num r">${Math.round(v)}</span></div>`).join("")}</div>
    <div style="margin-top:6px">${sparkline(f.historique.v, 300, 44)}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">Calculé chaque soir sur les 200 valeurs suivies. Chaque composante est comparée à sa dernière année (0 = niveau le plus craintif, 100 = le plus euphorique).
      Acheter quand les autres ont peur, être prudent quand ils sont euphoriques.</p></div>`;
}

function macroCard() {
  const M = SCAN.macro || [];
  if (!M.length) return "";
  const val = (m) => m.ticker === "EURUSD=X" ? num(m.valeur, 4) : m.unite === "%" ? num(m.valeur, 2) + " %" : num(m.valeur, m.valeur > 100 ? 0 : 2) + (m.unite === "$" ? " $" : "");
  return `<div class="card"><h2>🌍 Macro & matières premières</h2><div class="macro">
    ${M.map((m) => `<div class="macro-i"><div class="muted" style="font-size:12px">${esc(m.nom)}</div>
      <div class="num" style="font-size:18px;font-weight:700">${val(m)}</div>
      <div style="font-size:12px">${m.ticker === "BCE" ? `<span class="muted">depuis le ${fmtDate(m.depuis, false)}${m.precedent !== m.valeur ? ` (avant ${num(m.precedent, 2)} %)` : ""}</span>`
        : `<span class="${m.ticker === "^VIX" ? cls(-m.var_1m) : cls(m.var_1m)}">${pct(m.var_1m)}</span> <span class="muted">1 mois</span>`}</div>
      ${m.historique ? sparkline(m.historique, 120, 26) : ""}</div>`).join("")}
  </div><p class="muted" style="font-size:12px;margin:8px 0 0">VIX élevé = marchés inquiets. Taux en hausse = pression sur les actions de croissance. Euro fort = pénalise les exportateurs européens.</p></div>`;
}

function agendaCard(events, titre = "📅 Agenda des 30 prochains jours", limit = 14) {
  const today = new Date().toISOString().slice(0, 10);
  const ev = (events || []).filter((e) => e.date >= today).slice(0, limit);
  if (!ev.length) return `<div class="card"><h2>${titre}</h2><p class="muted">Aucune publication ni dividende annoncé.</p></div>`;
  return `<div class="card"><h2>${titre}</h2><div class="agenda">
    ${ev.map((e) => `<a class="ag ${e.detenu ? "held" : ""}" href="${assetLink(e.ticker)}">
      <span class="ag-d num">${new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
      <span class="ag-n"><b>${esc(e.nom)}</b> ${e.detenu ? "💼" : ""}<br><span class="muted" style="font-size:12px">${e.type === "resultats" ? "📊 Résultats" : `💶 Dividende${isNum(e.montant) ? ` ${num(e.montant)} (${pct(e.rendement, 1, false)})` : ""}`}</span></span></a>`).join("")}
  </div></div>`;
}

function theseCard(a) {
  const t = a.these;
  if (!t) return "";
  return `<div class="card mb these"><h2>🤖 L'analyse du robot</h2>
    <div class="verdict ${t.ton}">${esc(t.verdict)}</div>
    <p class="muted" style="margin:8px 0 12px">${esc(t.resume)}</p>
    <div class="grid g2">
      <div><h3 class="up">✓ Points forts</h3>${t.forts.length ? `<ul>${t.forts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="muted">Aucun point fort marquant.</p>'}</div>
      <div><h3 class="warn">⚠ Points de vigilance</h3>${t.faibles.length ? `<ul>${t.faibles.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="muted">Aucun signal d\'alerte.</p>'}</div>
    </div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Synthèse automatique (règles fixes, pas d'avis humain) de la technique, des analystes, des fondamentaux, des grands fonds, de l'actualité et de l'agenda.</p></div>`;
}

const FAM = { qualite: "Qualité (rentabilité)", croissance: "Croissance", valorisation: "Valorisation (prix)", solidite: "Solidité (dette)", rendement: "Dividende" };

function fondaCard(a) {
  const f = a.fondamentaux;
  if (!f) return "";
  const r = (v) => isNum(v) ? pct(v, 1, false) : "—";
  return `<div class="card"><h2>📑 Fondamentaux <span class="num" style="float:right;color:${scoreColor(f.score)}">${Math.round(f.score)}/100</span></h2>
    ${Object.entries(FAM).filter(([k]) => isNum(f.familles[k])).map(([k, l]) => `<div class="bar"><span>${l}</span>
      <div class="track"><div class="fill" style="width:${f.familles[k]}%;background:${scoreColor(f.familles[k])}"></div></div><span class="num r">${Math.round(f.familles[k])}</span></div>`).join("")}
    <dl class="kv mt">
      <dt>PER (prix / bénéfice)</dt><dd>${num(f.per, 1)}</dd>
      <dt>Rentabilité des capitaux (ROE)</dt><dd>${r(f.roe)}</dd>
      <dt>Marge nette</dt><dd>${r(f.marge)}</dd>
      <dt>Croissance du chiffre d'affaires</dt><dd class="${cls(f.croissance_ca)}">${isNum(f.croissance_ca) ? pct(f.croissance_ca) : "—"}</dd>
      <dt>Croissance du bénéfice</dt><dd class="${cls(f.croissance_bpa)}">${isNum(f.croissance_bpa) ? pct(f.croissance_bpa) : "—"}</dd>
      <dt>Dette / fonds propres</dt><dd>${isNum(f.dette_fp) ? num(f.dette_fp / 100, 2) + " ×" : "—"}</dd>
      <dt>Rendement du dividende</dt><dd>${r(f.rendement)}</dd>
      <dt>Bêta</dt><dd>${num(f.beta, 2)}</dd>
    </dl>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Chaque famille est notée par rapport aux ${SCAN.actifs.filter((x) => isNum(x.fonda)).length} autres actions suivies (100 = la meilleure).</p></div>`;
}

function fondsCard(a) {
  const f = a.fonds;
  if (!f || !f.top || !f.top.length) return "";
  const lib = f.flux > 0.02 ? ['up', "Les grands fonds renforcent"] : f.flux < -0.02 ? ["down", "Les grands fonds allègent"] : ["muted", "Positions des grands fonds stables"];
  return `<div class="card"><h2>🏦 Qui détient ${esc(a.nom)} ?</h2>
    <div class="verdict ${lib[0]}" style="font-size:14px">${lib[1]} <span class="muted" style="font-weight:500">· ${f.renforcent} achètent, ${f.allegent} vendent (dernier trimestre)</span></div>
    <div class="levels mt" style="grid-template-columns:repeat(2,1fr)">
      <div class="lvl"><div class="k">Institutionnels</div><div class="v">${isNum(f.institutions) ? pct(f.institutions, 0, false) : "—"}</div></div>
      <div class="lvl"><div class="k">Dirigeants / familles</div><div class="v">${isNum(f.initiés) ? pct(f.initiés, 1, false) : "—"}</div></div>
    </div>
    <div class="table-wrap mt"><table><thead><tr><th>Fonds</th><th class="r">Part</th><th class="r">Variation</th></tr></thead><tbody>
      ${f.top.slice(0, 8).map((h) => `<tr style="cursor:default"><td style="white-space:normal">${esc(h.nom)}</td><td class="r num">${pct(h.part, 2, false)}</td>
        <td class="r num ${cls(h.variation)}">${isNum(h.variation) ? pct(h.variation) : "—"}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Déclarations trimestrielles des fonds (Vanguard, BlackRock/iShares, Norges…). « Variation » = évolution du nombre d'actions détenues.</p></div>`;
}

function riskCard(R) {
  if (!R) return "";
  const pctBar = (k, v) => `<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${v * 100}%"></div></div><span class="num r">${Math.round(v * 100)} %</span></div>`;
  const C = R.courbe;
  const line = (vals, col) => { const lo = Math.min(...C.v, ...C.cac), hi = Math.max(...C.v, ...C.cac), sp = hi - lo || 1;
    return `<polyline fill="none" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke" points="${vals.map((x, i) => `${(i / (vals.length - 1) * 300).toFixed(1)},${(78 - (x - lo) / sp * 74).toFixed(1)}`).join(" ")}"/>`; };
  return `<div class="card mb"><h2>🛡️ Risque du portefeuille (positions réelles)</h2>
    <div class="grid g4">
      ${kpi("Volatilité", pct(R.volatilite, 0, false), "par an")}
      ${kpi("Perte probable max (1 mois)", eur(-R.var95_1m_eur, 0), `${pct(-R.var95_1m)} · 1 mois sur 20 fait pire`, "down")}
      ${kpi("Pire baisse sur 1 an", pct(R.drawdown_1a), "du sommet au creux", "down")}
      ${kpi("Bêta vs CAC 40", num(R.beta, 2), R.beta > 1.1 ? "amplifie le marché" : R.beta < 0.9 ? "plus calme que le marché" : "suit le marché")}
    </div>
    <div class="grid g2 mt">
      <div><h3>Sur 1 an : ton mix <span class="${cls(R.perf_1a)}">${pct(R.perf_1a)}</span> vs CAC 40 <span class="${cls(R.perf_cac_1a)}">${pct(R.perf_cac_1a)}</span></h3>
        <svg viewBox="0 0 300 80" width="100%" height="110" preserveAspectRatio="none">${line(C.cac, "var(--muted)")}${line(C.v, "var(--accent)")}</svg>
        <div class="legend"><span><i style="background:var(--accent)"></i>Tes positions actuelles</span><span><i style="background:var(--muted)"></i>CAC 40</span></div>
        <p class="muted" style="font-size:12px">Comment aurait évolué ton portefeuille actuel s'il avait été détenu toute l'année.</p></div>
      <div><h3>Répartition par secteur · diversification ${num(R.n_effectif, 1)} lignes</h3>${Object.entries(R.secteurs).map(([k, v]) => pctBar(k, v)).join("")}
        ${R.conseils.length ? `<h3 class="mt warn">Conseils</h3><ul class="tips">${R.conseils.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : `<p class="up mt">✓ Portefeuille bien diversifié.</p>`}</div>
    </div></div>`;
}

function probBar(r) {
  const g = (r.p_obj1 || 0) * 100, s = (r.p_stop || 0) * 100;
  return `<div class="probbar" title="Objectif 1 avant stop ${prob(r.p_obj1)} · stop d'abord ${prob(r.p_stop)}">
    <i style="width:${g}%;background:var(--up)"></i><i style="width:${Math.max(0, 100 - g - s)}%"></i><i style="width:${s}%;background:var(--down)"></i></div>`;
}

// ------------------------------------------------------------------ graphiques

function clearCharts() {
  charts.forEach((c) => { try { c.remove(); } catch { /* déjà supprimé */ } });
  charts = [];
}

function makeChart(el, extra = {}) {
  const chart = LC.createChart(el, {
    autoSize: true,
    layout: { background: { type: "solid", color: css("--panel") }, textColor: css("--muted"), fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
    grid: { vertLines: { color: css("--grid") }, horzLines: { color: css("--grid") } },
    rightPriceScale: { borderColor: css("--border") },
    timeScale: { borderColor: css("--border") },
    crosshair: { mode: LC.CrosshairMode.Normal },
    localization: { locale: "fr-FR", priceFormatter: (p) => num(p, 2) },
    ...extra,
  });
  charts.push(chart);
  return chart;
}

const line = (chart, color, width = 2, opts = {}) =>
  chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opts });

const series = (t, v) => t.map((time, i) => ({ time, value: v[i] })).filter((p) => isNum(p.value));

function priceLine(s, price, color, title, style = LC.LineStyle.Dashed) {
  if (isNum(price)) s.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
}

function businessDays(fromIso, n) {
  const out = [], d = new Date(fromIso + "T12:00:00Z");
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ------------------------------------------------------------------ tableau de bord

function regimeClass(r) {
  return r.haussier && r.largeur > 0.5 ? "up" : r.haussier || r.largeur > 0.4 ? "warn" : "down";
}

function pickCard(r) {
  return `<div class="card pick" onclick="location.hash='${assetLink(r.ticker)}'">
    <div class="pick-head">
      <div><div class="pick-name">${esc(r.nom)}</div>
        <div class="muted mono" style="font-size:12px">${esc(r.ticker)} · <span class="badge b-type">${esc(r.type)}</span> ${badge(r.label)}</div></div>
      ${ring(r.score)}
    </div>
    <div class="levels">
      <div class="lvl"><div class="k">Entrée</div><div class="v">${num(r.entree)}</div></div>
      <div class="lvl"><div class="k">Stop</div><div class="v down">${num(r.stop)}</div></div>
      <div class="lvl"><div class="k">Obj. 1</div><div class="v up">${num(r.obj1)}</div></div>
      <div class="lvl"><div class="k">Obj. 2</div><div class="v up">${num(r.obj2)}</div></div>
    </div>
    <div>${probBar(r)}
      <div class="muted" style="font-size:12px;margin-top:6px">Objectif 1 avant stop : <b class="up">${prob(r.p_obj1)}</b>${isNum(r.jours_obj1) ? ` · ~${Math.round(r.jours_obj1)} séances` : ""}</div></div>
    <div class="muted" style="font-size:12px">Conviction <b class="mono" style="color:var(--text)">${num(r.conviction, 0)}</b>
      · Backtest ${r.bt_trades} trades, ${prob(r.bt_reussite)} gagnants${isNum(r.bt_facteur) ? `, PF ${num(r.bt_facteur)}` : ""}
      · ${r.quantite ? `Taille suggérée ${r.quantite} × ≈ ${eur(r.quantite * r.entree, 0)}` : `1 titre = ${eur(r.entree, 0)}, trop cher pour ton capital`}</div>
  </div>`;
}

function renderDashboard() {
  const S = SCAN, A = S.actifs;
  const achats = A.filter(isBuy);
  const etfs = A.filter((r) => r.type === "ETF");
  const movers = [...A].sort((a, b) => (b.score - b.score_1s) - (a.score - a.score_1s)).slice(0, 6);

  const secteurs = {};
  A.filter((r) => r.type === "Action").forEach((r) => (secteurs[r.secteur] ||= []).push(r.score));
  const sect = Object.entries(secteurs).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => b[1] - a[1]);

  const pf = PF && PF.positions.length ? PF : null;
  const alertes = pf ? pf.positions.filter((p) => (p.urgence || 0) >= 2).length : 0;

  app.innerHTML = `
    <h1>Tableau de bord</h1>
    <p class="sub">Analyse de ${A.length} actifs éligibles PEA · données du ${fmtDate(S.maj)}</p>
    <div class="banner ${regimeClass(S.regime)}"><span class="dot"></span>${esc(S.regime.texte)}</div>
    ${pf ? `<a class="card mb only-m" href="#/portefeuille" style="color:inherit">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div><div class="muted" style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px">💼 Mon portefeuille</div>
          <div class="num" style="font-size:22px;font-weight:700;margin-top:4px">${eur(pf.total.valeur, 0)}</div>
          <div class="${cls(pf.total.plus_value)} num">${eur(pf.total.plus_value, 0)} (${pct(pf.total.plus_value_pct)})</div></div>
        <div style="text-align:right;font-size:13px">${alertes ? `<b class="warn">⚠️ ${alertes} action(s) à faire</b>` : '<span class="up">✅ Rien à vendre</span>'}<div class="muted" style="margin-top:4px">Voir le détail →</div></div>
      </div></a>` : ""}

    ${briefCard()}
    ${SCAN.sentiment || SCAN.macro ? `<div class="grid g2 mb">${sentimentCard()}${macroCard()}</div>` : ""}
    <div class="grid g4 mb">
      ${S.marche.map((m) => `<div class="card kpi">
        <div class="label">${esc(m.nom)}</div>
        <div class="value">${num(m.prix, 0)} <span class="${cls(m.var_1j)}" style="font-size:14px">${pct(m.var_1j, 2)}</span></div>
        <div class="hint">1 mois <span class="${cls(m.var_1m)}">${pct(m.var_1m)}</span> · 1 an <span class="${cls(m.var_1a)}">${pct(m.var_1a)}</span> · ${m.au_dessus_mm200 ? '<span class="up">au-dessus</span>' : '<span class="down">sous</span>'} MM200</div>
        <div class="mt" style="margin-top:8px">${sparkline(m.historique)}</div></div>`).join("")}
      <div class="card kpi"><div class="label">Largeur du marché</div>
        <div class="value">${pct(S.regime.largeur, 0, false)}</div>
        <div class="hint">des actifs suivis au-dessus de leur moyenne 200 jours</div>
        <div class="bar mt" style="grid-template-columns:1fr"><div class="track"><div class="fill" style="width:${S.regime.largeur * 100}%"></div></div></div></div>
      <div class="card kpi"><div class="label">Signaux d'achat</div>
        <div class="value">${achats.length}<span class="muted" style="font-size:14px"> / ${A.length}</span></div>
        <div class="hint">${A.filter((r) => r.label === "ACHAT FORT").length} « achat fort » · score moyen ${num(S.regime.score_moyen, 0)}/100</div>
        ${pf ? `<div class="hint mt" style="margin-top:8px">Portefeuille : <b class="${cls(pf.total.plus_value)}">${eur(pf.total.plus_value, 0)}</b> ${alertes ? `· <b class="warn">${alertes} alerte(s)</b>` : ""}</div>` : ""}</div>
    </div>

    ${(() => {
      const af = A.filter((r) => r.achat_fort).sort((a, b) => b.note - a.note);
      return af.length ? `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2>🔥 Achat fort : technique + experts</h2>
        <a href="#/achat-fort">Voir les ${af.length} propositions →</a></div><div class="grid g3 mb">${af.slice(0, 3).map(strongCard).join("")}</div>` : "";
    })()}
    <h2>Meilleures propositions d'achat (signal technique)</h2>
    ${achats.length ? `<div class="grid g3 mb">${achats.slice(0, isMobile() ? 3 : 6).map(pickCard).join("")}</div>`
      : `<div class="card empty mb">Aucun signal d'achat aujourd'hui. Dans ce contexte, patienter fait partie de la stratégie.</div>`}

    <div class="grid g-main mb">
      <div class="card">
        <h2>ETF PEA : classement</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>ETF</th><th class="r">Cours</th><th class="r hide-m">1 mois</th><th class="r">1 an</th><th class="r">Score</th><th class="hide-m">Signal</th><th class="r hide-m">P(obj.)</th></tr></thead>
          <tbody>${etfs.slice(0, 10).map((r) => `<tr onclick="location.hash='${assetLink(r.ticker)}'">
            <td style="white-space:normal"><b>${esc(r.nom)}</b> <span class="muted mono">${esc(r.ticker)}</span><div class="muted" style="font-size:12px">${esc(r.secteur)}</div></td>
            <td class="r num">${num(r.prix)}</td><td class="r num hide-m ${cls(r.var_1m)}">${pct(r.var_1m)}</td>
            <td class="r num ${cls(r.var_1a)}">${pct(r.var_1a)}</td><td class="r num"><b>${num(r.score, 0)}</b></td>
            <td class="hide-m">${badge(r.label)}</td><td class="r num hide-m">${prob(r.p_obj1)}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="mt"><a href="#/scanner">Voir les ${etfs.length} ETF et toutes les actions →</a></div>
      </div>
      <div class="grid" style="align-content:start">
        ${SCAN.agenda ? agendaCard(SCAN.agenda, "📅 Agenda : résultats & dividendes", 10) : ""}
        <div class="card"><h2>Score moyen par secteur</h2>
          ${sect.map(([k, v, n]) => `<div class="bar"><span title="${n} valeurs">${esc(k)}</span>
            <div class="track"><div class="fill" style="width:${v}%;background:${scoreColor(v)}"></div></div><span class="num r">${num(v, 0)}</span></div>`).join("")}</div>
        <div class="card"><h2>Plus fortes progressions du score (1 semaine)</h2>
          <div class="kv">${movers.map((r) => `<dt><a href="${assetLink(r.ticker)}">${esc(r.nom)}</a></dt>
            <dd><span class="${cls(r.score - r.score_1s)}">${r.score - r.score_1s > 0 ? "+" : ""}${num(r.score - r.score_1s, 1)}</span> → ${num(r.score, 0)}</dd>`).join("")}</div></div>
      </div>
    </div>`;
}

// ------------------------------------------------------------------ achat fort (technique + experts)

const niche = (r) => r.niche ? `<span class="badge b-niche">NICHE</span>` : "";
const capTxt = (v) => !isNum(v) ? "—" : v >= 1e9 ? num(v / 1e9, 1) + " Md€" : num(v / 1e6, 0) + " M€";

function mini(label, v) {
  return `<div class="lvl"><div class="k">${label}</div><div class="v" style="color:${isNum(v) ? scoreColor(v) : "var(--muted)"}">${isNum(v) ? Math.round(v) : "—"}</div></div>`;
}

function strongCard(r) {
  return `<div class="card pick strong" onclick="location.hash='${assetLink(r.ticker)}'">
    <div class="pick-head">
      <div><div class="pick-name">${esc(r.nom)} ${niche(r)}</div>
        <div class="muted mono" style="font-size:12px">${esc(r.ticker)} · ${esc(r.secteur)} · ${capTxt(r.cap_eur)}</div></div>
      ${ring(r.note)}
    </div>
    <div class="levels">${mini("Technique", r.score)}${mini("Experts", r.exp_score)}${mini("Fondamentaux", r.fonda)}${mini("Actualités", r.news_score)}</div>
    ${r.points && r.points.length ? `<ul class="pts">${r.points.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}${(r.vigilance || []).slice(0, 1).map((x) => `<li class="vg">${esc(x)}</li>`).join("")}</ul>` : ""}
    ${r.fonds ? `<div style="font-size:12px">🏦 Grands fonds : <b class="${r.fonds === "renforcent" ? "up" : r.fonds === "allègent" ? "down" : "muted"}">${r.fonds}</b></div>` : ""}
    <div class="consensus">
      <div><span class="muted">Analystes</span> <b>${esc(r.exp_libelle || "—")}</b> <span class="muted">(${r.exp_n})</span></div>
      <div><span class="muted">Objectif moyen</span> <b class="mono">${num(r.exp_cible)}</b> <b class="${cls(r.exp_potentiel)}">${pct(r.exp_potentiel, 0)}</b></div>
    </div>
    <div class="levels">
      <div class="lvl"><div class="k">Entrée</div><div class="v">${num(r.entree)}</div></div>
      <div class="lvl"><div class="k">Stop</div><div class="v down">${num(r.stop)}</div></div>
      <div class="lvl"><div class="k">Obj. 1</div><div class="v up">${num(r.obj1)}</div></div>
      <div class="lvl"><div class="k">Obj. 2</div><div class="v up">${num(r.obj2)}</div></div>
    </div>
    <div>${probBar(r)}<div class="muted" style="font-size:12px;margin-top:6px">Objectif 1 avant stop : <b class="up">${prob(r.p_obj1)}</b>
      · ${r.quantite ? `taille suggérée ${r.quantite} × ≈ ${eur(r.quantite * r.entree, 0)}` : `<span class="warn">1 titre = ${eur(r.entree, 0)}, au-delà du maximum par ligne de ton capital</span>`}</div></div>
  </div>`;
}

let sbFilter = store.get("sbFilter", "Tous");

function renderStrongBuy() {
  const all = SCAN.actifs.filter((r) => r.achat_fort).sort((a, b) => b.note - a.note);
  const list = all.filter((r) => sbFilter === "Tous" || (sbFilter === "Niches" ? r.niche : !r.niche));
  const watch = SCAN.actifs.filter((r) => r.surveiller).sort((a, b) => b.exp_score - a.exp_score);
  const avecExperts = SCAN.actifs.filter((r) => isNum(r.exp_score)).length;

  app.innerHTML = `
    <h1>🔥 Propositions d'achat fort</h1>
    <p class="sub">Les valeurs où <b>trois sources sont d'accord</b> : le signal technique de GEORJOTRAD, le consensus des analystes
      (${avecExperts} actions suivies par les banques et brokers) et le ton des actualités des 30 derniers jours.</p>
    <div class="toolbar">
      <div class="seg" id="sb-f">${["Tous", "Niches", "Grandes valeurs"].map((t) => `<button data-v="${t}" class="${sbFilter === t ? "on" : ""}">${t}</button>`).join("")}</div>
      <span class="muted">${list.length} proposition(s) · niche = capitalisation inférieure à 2 Md€</span>
    </div>
    ${list.length ? `<div class="grid g3 mb">${list.map(strongCard).join("")}</div>`
      : `<div class="card empty mb">Aucune valeur ne réunit aujourd'hui les trois conditions dans cette catégorie.</div>`}

    <div class="card mb">
      <h2>À surveiller : les experts y croient, le signal technique n'est pas encore là</h2>
      <p class="muted" style="margin-top:-6px">Analystes très positifs et fort potentiel, mais la tendance n'a pas encore confirmé. Elles peuvent passer en achat fort dans les prochaines semaines.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Valeur</th><th class="r">Cours</th><th class="r">Score technique</th><th>Analystes</th><th class="r">Objectif</th><th class="r">Potentiel</th><th class="r">Score experts</th></tr></thead>
        <tbody>${watch.map((r) => `<tr onclick="location.hash='${assetLink(r.ticker)}'">
          <td><b>${esc(r.nom)}</b> ${niche(r)} <span class="muted mono">${esc(r.ticker)}</span></td>
          <td class="r num">${num(r.prix)}</td><td class="r num" style="color:${scoreColor(r.score)}">${num(r.score, 0)}</td>
          <td>${esc(r.exp_libelle)} <span class="muted">(${r.exp_n})</span></td><td class="r num">${num(r.exp_cible)}</td>
          <td class="r num ${cls(r.exp_potentiel)}">${pct(r.exp_potentiel, 0)}</td><td class="r num"><b>${num(r.exp_score, 0)}</b></td></tr>`).join("")
          || `<tr><td colspan="7" class="empty">Aucune pour le moment.</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="card prose">
      <h2>Comment la note est calculée</h2>
      <ul>
        <li><b>Technique (45 %)</b> : la conviction GEORJOTRAD (score, Monte-Carlo, backtest). Il faut un score d'au moins 62, donc un vrai signal d'achat.</li>
        <li><b>Experts (27 %)</b> : recommandation moyenne des analystes, potentiel jusqu'à leur objectif de cours, et évolution des avis sur 3 mois. Avec moins de 5 analystes, l'avis compte moins.</li>
        <li><b>Fondamentaux (18 %)</b> : rentabilité, croissance, valorisation, dette et dividende, comparés aux autres actions suivies. Une société aux fondamentaux très faibles (&lt; 25) est exclue.</li>
        <li><b>Actualités (10 %)</b> : titres de presse financière des 30 derniers jours (Google Actualités), classés positifs ou négatifs.</li>
      </ul>
      <p class="muted">Conditions pour apparaître ici : signal d'achat technique, consensus « achat » (note moyenne ≤ 2,3 sur 5), potentiel d'au moins 5 % et score experts ≥ 60. Les analystes se trompent aussi : leurs objectifs sont souvent trop optimistes.</p>
    </div>`;

  document.querySelectorAll("#sb-f button").forEach((b) => b.onclick = () => { sbFilter = b.dataset.v; store.set("sbFilter", sbFilter); renderStrongBuy(); });
}

// ------------------------------------------------------------------ scanner

const COLS = [
  ["nom", "Actif"], ["type", "Type"], ["secteur", "Secteur"], ["prix", "Cours", 1], ["var_1j", "1 j", 1], ["var_1m", "1 m", 1],
  ["var_6m", "6 m", 1], ["var_1a", "1 an", 1], ["score", "Score", 1], ["delta", "Δ 1 sem.", 1], ["label", "Signal"],
  ["conviction", "Conviction", 1], ["note", "Note globale", 1], ["fonda", "Fonda.", 1], ["fonds", "Fonds"], ["exp_libelle", "Analystes"], ["exp_potentiel", "Potentiel", 1], ["p_obj1", "P(obj. 1)", 1], ["rsi", "RSI", 1], ["vol", "Volat.", 1], ["bt_facteur", "PF backtest", 1],
];
const filt = Object.assign({ q: "", type: "Tous", signal: "Tous", secteur: "Tous", mm200: false, niche: false, sort: "conviction", dir: -1 }, store.get("scanner", {}));

function renderScanner() {
  const secteurs = [...new Set(SCAN.actifs.map((r) => r.secteur))].sort();
  app.innerHTML = `
    <h1>Scanner</h1>
    <p class="sub">${SCAN.actifs.length} actifs éligibles PEA, notés de 0 à 100. Clique sur une ligne pour le plan de trade complet.</p>
    <div class="card">
      <div class="toolbar">
        <input id="f-q" type="search" placeholder="Rechercher un nom ou un ticker…" value="${esc(filt.q)}" style="flex:1;min-width:200px">
        <div class="seg" id="f-type">${["Tous", "Action", "ETF"].map((t) => `<button data-v="${t}" class="${filt.type === t ? "on" : ""}">${t === "Action" ? "Actions" : t}</button>`).join("")}</div>
        <select id="f-signal">${["Tous", "🔥 Achat fort (experts)", "Achats", "ACHAT FORT", "ACHAT", "NEUTRE", "ALLÉGER", "ÉVITER"].map((s) => `<option ${filt.signal === s ? "selected" : ""}>${s}</option>`).join("")}</select>
        <select id="f-secteur"><option>Tous</option>${secteurs.map((s) => `<option ${filt.secteur === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input id="f-mm" type="checkbox" ${filt.mm200 ? "checked" : ""}> Au-dessus MM200</label>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input id="f-niche" type="checkbox" ${filt.niche ? "checked" : ""}> Niches</label>
        <select id="f-sort" class="only-m">${[["note", "Tri : note globale"], ["score", "Tri : score"], ["conviction", "Tri : conviction"], ["exp_potentiel", "Tri : potentiel analystes"], ["fonda", "Tri : fondamentaux"], ["var_1j", "Tri : variation du jour"], ["var_1a", "Tri : 1 an"], ["nom", "Tri : nom"]]
          .map(([k, l]) => `<option value="${k}" ${filt.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <span id="f-count" class="muted"></span>
      </div>
      <div class="table-wrap"><table><thead class="hide-m"><tr>${COLS.map(([k, l, r]) => `<th data-k="${k}" class="${r ? "r" : ""}">${l}${filt.sort === k ? (filt.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
      <tbody id="rows"></tbody></table></div>
    </div>`;

  const redraw = () => { store.set("scanner", filt); drawRows(); };
  document.getElementById("f-q").oninput = (e) => { filt.q = e.target.value; redraw(); };
  document.getElementById("f-signal").onchange = (e) => { filt.signal = e.target.value; redraw(); };
  document.getElementById("f-secteur").onchange = (e) => { filt.secteur = e.target.value; redraw(); };
  document.getElementById("f-mm").onchange = (e) => { filt.mm200 = e.target.checked; redraw(); };
  document.getElementById("f-niche").onchange = (e) => { filt.niche = e.target.checked; redraw(); };
  document.getElementById("f-sort").onchange = (e) => { filt.sort = e.target.value; filt.dir = filt.sort === "nom" ? 1 : -1; redraw(); };
  document.querySelectorAll("#f-type button").forEach((b) => b.onclick = () => {
    filt.type = b.dataset.v;
    document.querySelectorAll("#f-type button").forEach((x) => x.classList.toggle("on", x === b));
    redraw();
  });
  document.querySelectorAll("th[data-k]").forEach((th) => th.onclick = () => {
    const k = th.dataset.k;
    filt.dir = filt.sort === k ? -filt.dir : (["nom", "type", "secteur"].includes(k) ? 1 : -1);
    filt.sort = k;
    store.set("scanner", filt);
    renderScanner();
  });
  drawRows();
}

const isMobile = () => matchMedia("(max-width: 640px)").matches;

function drawRows() {
  const q = filt.q.trim().toLowerCase();
  let rows = SCAN.actifs.map((r) => ({ ...r, delta: r.score - r.score_1s })).filter((r) =>
    (!q || r.nom.toLowerCase().includes(q) || r.ticker.toLowerCase().includes(q))
    && (filt.type === "Tous" || r.type === filt.type)
    && (filt.signal === "Tous" || (filt.signal === "Achats" ? isBuy(r) : filt.signal.startsWith("🔥") ? r.achat_fort : r.label === filt.signal))
    && (!filt.niche || r.niche)
    && (filt.secteur === "Tous" || r.secteur === filt.secteur)
    && (!filt.mm200 || r.au_dessus_mm200));
  const k = filt.sort;
  rows.sort((a, b) => {
    const x = a[k], y = b[k];
    if (typeof x === "string") return filt.dir * x.localeCompare(y, "fr");
    return filt.dir * ((isNum(x) ? x : -Infinity) - (isNum(y) ? y : -Infinity));
  });
  document.getElementById("f-count").textContent = `${rows.length} résultat(s)`;
  if (isMobile()) {
    document.getElementById("rows").innerHTML = rows.map((r) => `<tr class="mrow" onclick="location.hash='${assetLink(r.ticker)}'">
      <td><div class="nm">${esc(r.nom)} ${r.achat_fort ? "🔥" : ""}</div>
        <div class="meta">${badge(r.label)} ${niche(r)} <span class="mono">${esc(r.ticker)}</span>${r.exp_libelle ? ` · ${esc(r.exp_libelle)}` : ""}</div></td>
      <td class="r"><div class="num">${num(r.prix)}</div><div class="num ${cls(r.var_1j)}" style="font-size:12px">${pct(r.var_1j)}</div></td>
      <td class="r"><b class="num" style="font-size:16px;color:${scoreColor(r.score)}">${num(r.note ?? r.score, 0)}</b><div class="muted" style="font-size:11px">note</div></td></tr>`).join("")
      || `<tr><td class="empty">Aucun actif ne correspond aux filtres.</td></tr>`;
    return;
  }
  document.getElementById("rows").innerHTML = rows.map((r) => `<tr onclick="location.hash='${assetLink(r.ticker)}'">
    <td><b>${esc(r.nom)}</b> ${niche(r)} <span class="muted mono">${esc(r.ticker)}</span></td>
    <td><span class="badge b-type">${r.type}</span></td><td class="muted">${esc(r.secteur)}</td>
    <td class="r num">${num(r.prix)}</td><td class="r num ${cls(r.var_1j)}">${pct(r.var_1j)}</td>
    <td class="r num ${cls(r.var_1m)}">${pct(r.var_1m)}</td><td class="r num ${cls(r.var_6m)}">${pct(r.var_6m)}</td>
    <td class="r num ${cls(r.var_1a)}">${pct(r.var_1a)}</td>
    <td class="r num"><b style="color:${scoreColor(r.score)}">${num(r.score, 0)}</b></td>
    <td class="r num ${cls(r.delta)}">${r.delta > 0 ? "+" : ""}${num(r.delta, 1)}</td><td>${badge(r.label)}</td>
    <td class="r num">${num(r.conviction, 0)}</td><td class="r num"><b>${num(r.note, 0)}</b>${r.achat_fort ? " 🔥" : ""}</td>
    <td class="r num" style="color:${isNum(r.fonda) ? scoreColor(r.fonda) : "var(--muted)"}">${num(r.fonda, 0)}</td>
    <td class="${r.fonds === "renforcent" ? "up" : r.fonds === "allègent" ? "down" : "muted"}">${r.fonds || "—"}</td>
    <td>${r.exp_libelle ? `${esc(r.exp_libelle)} <span class="muted">(${r.exp_n})</span>` : '<span class="muted">—</span>'}</td>
    <td class="r num ${cls(r.exp_potentiel)}">${pct(r.exp_potentiel, 0)}</td><td class="r num">${prob(r.p_obj1)}</td>
    <td class="r num">${num(r.rsi, 0)}</td><td class="r num">${pct(r.vol, 0, false)}</td>
    <td class="r num">${num(r.bt_facteur)}</td></tr>`).join("") || `<tr><td colspan="${COLS.length}" class="empty">Aucun actif ne correspond aux filtres.</td></tr>`;
}

// ------------------------------------------------------------------ fiche actif

const COMP_LABELS = { tendance: "Tendance", momentum: "Momentum", force_relative: "Force relative", risque: "Risque maîtrisé", timing: "Timing d'entrée" };
const RAISONS = { stop: "Stop", "stop suiveur": "Stop suiveur", objectif: "Objectif", signal: "Score dégradé", "durée": "Durée max" };

async function renderAsset(ticker) {
  let a;
  try { a = await getAsset(ticker); } catch {
    app.innerHTML = `<div class="card empty">Actif introuvable : ${esc(ticker)}. <a href="#/scanner">Retour au scanner</a></div>`;
    return;
  }
  const p = a.plan, mc = a.montecarlo, bt = a.backtest, ind = a.indicateurs;
  const range = store.get("range", 252);

  app.innerHTML = `
    <div class="asset-head">
      <div><a href="#/scanner" class="muted">← Scanner</a>
        <h1 style="margin-top:6px">${esc(a.nom)}</h1>
        <div class="muted"><span class="mono">${esc(a.ticker)}</span> · <span class="badge b-type">${a.type}</span> · ${esc(a.secteur)} · clôture du ${fmtDate(a.date, false)}</div></div>
      <div style="display:flex;align-items:center;gap:18px">
        <div><div class="price-big">${num(a.prix)}</div><div class="${cls(a.var_1j)} num" style="text-align:right">${pct(a.var_1j, 2)} aujourd'hui</div></div>
        ${ring(a.score)}
        <div>${a.achat_fort ? '<span class="badge b-af">🔥 ACHAT FORT</span> ' : ""}${niche(a)} ${badge(a.label)}<div class="muted" style="font-size:12px;margin-top:4px">Conviction <b class="mono" style="color:var(--text)">${num(a.conviction, 0)}</b>/100</div>
          <a class="btn" style="display:inline-block;margin-top:8px;padding:6px 12px" href="#/portefeuille/${encodeURIComponent(a.ticker)}">+ Acheter / simuler</a></div>
      </div>
    </div>

    ${theseCard(a)}
    <div class="grid g-main mb">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <h2 style="margin:0">Cours et plan de trade</h2>
          <div class="seg" id="range">${[[63, "3M"], [126, "6M"], [252, "1A"], [500, "2A"]].map(([n, l]) => `<button data-n="${n}" class="${range === n ? "on" : ""}">${l}</button>`).join("")}</div>
        </div>
        <div id="c-price" class="chart"></div>
        <div class="legend"><span><i style="background:#f59e0b"></i>MM50</span><span><i style="background:#8b5cf6"></i>MM200</span>
          <span><i style="background:var(--down)"></i>Stop</span><span><i style="background:var(--up)"></i>Objectifs</span></div>
      </div>
      <div class="card">
        <h2>Plan de trade</h2>
        <dl class="kv">
          <dt>Zone d'achat</dt><dd>${num(p.zone_achat[0])} – ${num(p.zone_achat[1])}</dd>
          <dt>Stop de protection</dt><dd class="down">${num(p.stop)} (${pct(p.stop_pct)})</dd>
          <dt>Objectif 1 (2 R)</dt><dd class="up">${num(p.objectif_1)} (${pct(p.objectif_1_pct)})</dd>
          <dt>Objectif 2 (3,5 R)</dt><dd class="up">${num(p.objectif_2)} (${pct(p.objectif_2_pct)})</dd>
          <dt>Ratio gain / risque</dt><dd>${num(p.ratio_gain_risque, 1)}</dd>
          <dt>ATR (volatilité/jour)</dt><dd>${num(p.atr)}</dd>
          <dt>Quantité suggérée</dt><dd><b>${p.quantite}</b></dd>
          <dt>Montant engagé</dt><dd>${eur(p.montant, 0)}</dd>
          <dt>Perte max si stop</dt><dd class="down">${eur(p.perte_max_eur, 0)}</dd>
        </dl>
        <p class="muted" style="font-size:12px">Calculé pour un capital de ${eur(SCAN.parametres.capital, 0)} et ${num(SCAN.parametres.risque_par_trade_pct, 1)} % de risque par trade (réglable dans <span class="mono">config/settings.json</span>).</p>
        <h3 class="mt">Comment agir</h3>
        <ol class="steps">
          <li><span>${isBuy(a) ? `Acheter dans la zone <b>${num(p.zone_achat[0])} – ${num(p.zone_achat[1])}</b>, idéalement sur un léger repli.` : `Pas de signal d'achat actuellement (score ${num(a.score, 0)}). Attendre un score ≥ 62.`}</span></li>
          <li><span>Placer un ordre stop à <b class="down">${num(p.stop)}</b> dès l'achat.</span></li>
          <li><span>À <b class="up">${num(p.objectif_1)}</b> : remonter le stop au prix d'achat (trade sans risque).</span></li>
          <li><span>Ensuite, stop suiveur à 3 ATR sous le plus haut ; sortie complète à <b class="up">${num(p.objectif_2)}</b>.</span></li>
        </ol>
      </div>
    </div>

    ${a.experts || a.actualites ? `<div class="grid g2 mb">${expertsCard(a)}${newsCard(a)}</div>` : ""}
    ${a.fondamentaux || (a.fonds && a.fonds.top && a.fonds.top.length) ? `<div class="grid g2 mb">${fondaCard(a)}${fondsCard(a)}</div>` : ""}

    <div class="grid g2 mb">
      <div class="card"><h2>Historique du score</h2><div id="c-score" class="chart sm"></div>
        <div class="legend"><span><i style="background:var(--up)"></i>≥ 62 achat</span><span><i style="background:var(--down)"></i>&lt; 30 éviter</span></div></div>
      <div class="card"><h2>Décomposition du score</h2>
        ${Object.entries(a.composantes).map(([k, v]) => `<div class="bar"><span>${COMP_LABELS[k] || k} <span class="muted">${Math.round(a.poids[k] * 100)} %</span></span>
          <div class="track"><div class="fill" style="width:${v}%;background:${scoreColor(v)}"></div></div><span class="num r">${num(v, 0)}</span></div>`).join("")}
        <h3 class="mt">Indicateurs</h3>
        <dl class="kv">
          <dt>RSI 14</dt><dd>${num(ind.rsi, 1)} <span class="muted">${ind.rsi > 70 ? "surachat" : ind.rsi < 30 ? "survente" : "neutre"}</span></dd>
          <dt>ADX (force de tendance)</dt><dd>${num(ind.adx, 1)} <span class="muted">${ind.adx > 25 ? "tendance nette" : "pas de tendance"}</span></dd>
          <dt>MACD / signal</dt><dd class="${cls(ind.macd_hist)}">${num(ind.macd)} / ${num(ind.macd_signal)}</dd>
          <dt>MM20 · MM50 · MM200</dt><dd>${num(ind.sma20)} · ${num(ind.sma50)} · ${num(ind.sma200)}</dd>
          <dt>Momentum 1 m · 3 m · 6 m</dt><dd><span class="${cls(ind.mom_1m)}">${pct(ind.mom_1m)}</span> · <span class="${cls(ind.mom_3m)}">${pct(ind.mom_3m)}</span> · <span class="${cls(ind.mom_6m)}">${pct(ind.mom_6m)}</span></dd>
          <dt>Force relative 6 m vs indice</dt><dd class="${cls(ind.rs_6m)}">${pct(ind.rs_6m)}</dd>
          <dt>Volatilité annualisée</dt><dd>${pct(ind.vol_ann, 1, false)}</dd>
          <dt>Plus haut 52 sem. (écart)</dt><dd>${num(ind.high_52w)} (${pct(ind.dist_high)})</dd>
        </dl>
      </div>
    </div>

    <div class="grid g2 mb">
      <div class="card"><h2>Simulation Monte-Carlo · ${mc.horizon_jours} séances</h2>
        <div id="c-mc" class="chart sm"></div>
        <div class="legend"><span><i style="background:var(--accent)"></i>Médiane</span><span><i style="background:var(--accent);opacity:.45"></i>25–75 %</span><span><i style="background:var(--accent);opacity:.2"></i>5–95 %</span></div>
        <dl class="kv mt">
          <dt>Objectif 1 atteint avant le stop</dt><dd class="up"><b>${prob(mc.proba_objectif_1)}</b></dd>
          <dt>Objectif 2 atteint avant le stop</dt><dd class="up">${prob(mc.proba_objectif_2)}</dd>
          <dt>Stop touché en premier</dt><dd class="down">${prob(mc.proba_stop)}</dd>
          <dt>Délai médian vers l'objectif 1</dt><dd>${isNum(mc.jours_median_objectif_1) ? Math.round(mc.jours_median_objectif_1) + " séances" : "—"}</dd>
          <dt>Probabilité d'être en gain à l'horizon</dt><dd>${prob(mc.proba_gain)}</dd>
          <dt>Rendement médian · pessimiste (5 %) · optimiste (95 %)</dt><dd><span class="${cls(mc.rendement_median)}">${pct(mc.rendement_median)}</span> · <span class="down">${pct(mc.rendement_p5)}</span> · <span class="up">${pct(mc.rendement_p95)}</span></dd>
        </dl>
        <p class="muted" style="font-size:12px">3 000 trajectoires par bootstrap de blocs des rendements réels des 3 dernières années, dérive historique divisée par deux.</p>
      </div>
      <div class="card"><h2>Backtest de la stratégie · depuis ${fmtDate(bt.periode_debut, false)}</h2>
        <div class="grid g3 mb">
          <div class="kpi"><div class="label">Trades</div><div class="value">${bt.nb_trades}</div><div class="hint">durée moy. ${isNum(bt.duree_moyenne_jours) ? Math.round(bt.duree_moyenne_jours) + " séances" : "—"}</div></div>
          <div class="kpi"><div class="label">Gagnants</div><div class="value">${prob(bt.taux_reussite)}</div><div class="hint">gain ${pct(bt.gain_moyen)} · perte ${pct(bt.perte_moyenne)}</div></div>
          <div class="kpi"><div class="label">Facteur de profit</div><div class="value ${bt.facteur_profit >= 1 ? "up" : "down"}">${num(bt.facteur_profit)}</div><div class="hint">&gt; 1 = rentable</div></div>
        </div>
        <dl class="kv mb">
          <dt>Rendement cumulé de la stratégie</dt><dd class="${cls(bt.rendement_cumule)}">${pct(bt.rendement_cumule, 0)}</dd>
          <dt>Achat et conservation sur la période</dt><dd class="${cls(bt.achat_conserve)}">${pct(bt.achat_conserve, 0)}</dd>
          <dt>Temps investi</dt><dd>${pct(bt.exposition, 0, false)}</dd>
          ${bt.en_cours ? `<dt>Position en cours depuis ${fmtDate(bt.en_cours.entree, false)}</dt><dd class="${cls(bt.en_cours.rendement)}">${pct(bt.en_cours.rendement)}</dd>` : ""}
        </dl>
        <div class="table-wrap" style="max-height:260px"><table>
          <thead><tr><th>Entrée</th><th>Sortie</th><th class="r">Séances</th><th>Motif</th><th class="r">Résultat</th></tr></thead>
          <tbody>${bt.trades.slice().reverse().map((t) => `<tr style="cursor:default"><td class="num">${fmtDate(t.entree, false)}</td><td class="num">${fmtDate(t.sortie, false)}</td>
            <td class="r num">${t.jours}</td><td>${RAISONS[t.raison] || t.raison}</td><td class="r num ${cls(t.rendement)}">${pct(t.rendement)}</td></tr>`).join("")
            || `<tr><td colspan="5" class="empty">Aucun trade sur la période.</td></tr>`}</tbody></table></div>
        <p class="muted" style="font-size:12px">Frais de 0,2 % aller-retour inclus. Le backtest ne garantit pas les résultats futurs.</p>
      </div>
    </div>`;

  drawPriceChart(a, range);
  document.querySelectorAll("#range button").forEach((b) => b.onclick = () => {
    store.set("range", +b.dataset.n);
    document.querySelectorAll("#range button").forEach((x) => x.classList.toggle("on", x === b));
    charts[0].timeScale().setVisibleLogicalRange({ from: a.graph.t.length - +b.dataset.n, to: a.graph.t.length + 2 });
  });
  drawScoreChart(a);
  drawMonteCarlo(a);
}

const RECO = [["strongBuy", "Achat fort", "var(--up)"], ["buy", "Achat", "color-mix(in srgb, var(--up) 55%, transparent)"],
  ["hold", "Conserver", "var(--muted)"], ["sell", "Vente", "color-mix(in srgb, var(--down) 55%, transparent)"], ["strongSell", "Vente forte", "var(--down)"]];

function expertsCard(a) {
  const e = a.experts;
  if (!e) return `<div class="card"><h2>Avis des analystes</h2><div class="empty">Pas de couverture par les analystes${a.type === "ETF" ? " (normal pour un ETF)" : ""}.</div></div>`;
  const h = (e.historique || [])[0] || {};
  const tot = RECO.reduce((s, [k]) => s + (h[k] || 0), 0);
  const lo = e.cible_basse, hi = e.cible_haute, span = Math.max(hi, a.prix) - Math.min(lo, a.prix) || 1, base = Math.min(lo, a.prix);
  const at = (v) => (6 + (v - base) / span * 88).toFixed(1) + "%";
  return `<div class="card"><h2>Avis des analystes</h2>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">${ring(e.score)}
      <div><div style="font-weight:700;font-size:16px">${esc(e.reco_libelle)}</div>
        <div class="muted">${e.nb_analystes} analyste(s) · note moyenne ${num(e.reco_moyenne, 2)} / 5 (1 = achat fort)</div></div></div>
    ${tot ? `<div class="probbar" style="height:12px">${RECO.map(([k, , c]) => `<i style="width:${(h[k] || 0) / tot * 100}%;background:${c}"></i>`).join("")}</div>
      <div class="legend">${RECO.filter(([k]) => h[k]).map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${h[k]}</span>`).join("")}</div>` : ""}
    ${isNum(lo) && isNum(hi) ? `<h3 class="mt">Objectifs de cours</h3>
      <div class="target"><div class="track"></div>
        <span class="tick" style="left:${at(a.prix)}" title="Cours actuel"><b>Cours ${num(a.prix)}</b></span>
        <span class="tick cible" style="left:${at(e.cible_moy)}"><b>Moyenne ${num(e.cible_moy)}</b></span></div>
      <div style="display:flex;justify-content:space-between" class="muted" style="font-size:12px"><span>Objectif le plus bas <b class="mono">${num(lo)}</b></span><span>le plus haut <b class="mono">${num(hi)}</b></span></div>` : ""}
    <dl class="kv mt">
      <dt>Potentiel jusqu'à l'objectif moyen</dt><dd class="${cls(e.potentiel)}"><b>${pct(e.potentiel)}</b></dd>
      <dt>Évolution des avis « achat » sur 3 mois</dt><dd class="${cls(e.revision)}">${e.revision > 0 ? "+" : ""}${num((e.revision || 0) * 100, 0)} pts</dd>
      <dt>Capitalisation</dt><dd>${capTxt(e.cap_eur)} ${e.niche ? "· niche" : ""}</dd>
      <dt>Données du</dt><dd>${fmtDate(e.date, false)}</dd>
    </dl></div>`;
}

function newsCard(a) {
  const n = a.actualites;
  if (!n || !n.articles.length) return `<div class="card"><h2>Actualités</h2><div class="empty">Actualités collectées uniquement pour les ~40 meilleures candidates et tes positions.</div></div>`;
  const dot = (s) => `<span class="dot" style="color:${s > 0 ? "var(--up)" : s < 0 ? "var(--down)" : "var(--muted)"};margin-top:6px"></span>`;
  return `<div class="card"><h2>Actualités · 30 derniers jours</h2>
    <div class="muted mb">${n.positifs} positive(s) · ${n.negatifs} négative(s) · score <b style="color:${scoreColor(n.score)}">${num(n.score, 0)}</b>/100</div>
    <div class="news">${n.articles.map((x) => `<a class="news-item" href="${esc(x.lien)}" target="_blank" rel="noopener noreferrer">${dot(x.sentiment)}
      <span><span class="news-t">${esc(x.titre)}</span><span class="muted" style="font-size:12px"> · ${esc(x.source)} · ${fmtDate(x.date, false)}</span></span></a>`).join("")}</div></div>`;
}

function drawPriceChart(a, range) {
  const g = a.graph, p = a.plan;
  const chart = makeChart(document.getElementById("c-price"));
  const up = css("--up"), down = css("--down");
  const candles = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
  candles.setData(g.t.map((time, i) => ({ time, open: g.o[i], high: g.h[i], low: g.l[i], close: g.c[i] })).filter((x) => isNum(x.close)));
  line(chart, "#f59e0b", 1).setData(series(g.t, g.mm50));
  line(chart, "#8b5cf6", 2).setData(series(g.t, g.mm200));
  const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
  chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  vol.setData(g.t.map((time, i) => ({ time, value: g.v[i], color: g.c[i] >= g.o[i] ? css("--up-soft") : css("--down-soft") })));
  priceLine(candles, p.stop, down, "Stop");
  priceLine(candles, p.objectif_1, up, "Obj. 1");
  priceLine(candles, p.objectif_2, up, "Obj. 2", LC.LineStyle.Solid);
  if (a.experts) priceLine(candles, a.experts.cible_moy, css("--accent"), "Cible analystes", LC.LineStyle.SparseDotted);
  chart.timeScale().setVisibleLogicalRange({ from: g.t.length - range, to: g.t.length + 2 });
}

function drawScoreChart(a) {
  const chart = makeChart(document.getElementById("c-score"), { rightPriceScale: { borderColor: css("--border"), scaleMargins: { top: 0.05, bottom: 0.05 } } });
  const s = chart.addAreaSeries({ lineColor: css("--accent"), topColor: css("--accent-soft"), bottomColor: "transparent", lineWidth: 2, priceLineVisible: false });
  s.setData(series(a.graph.t, a.graph.score));
  s.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
  priceLine(s, 62, css("--up"), "");
  priceLine(s, 75, css("--up"), "");
  priceLine(s, 30, css("--down"), "");
  chart.timeScale().fitContent();
}

function drawMonteCarlo(a) {
  const ev = a.montecarlo.eventail, g = a.graph;
  const chart = makeChart(document.getElementById("c-mc"));
  const past = 120, n0 = g.t.length;
  const last = g.t[n0 - 1], future = businessDays(last, ev.p50.length);
  const hist = line(chart, css("--muted"), 2);
  hist.setData(series(g.t.slice(n0 - past), g.c.slice(n0 - past)));
  const acc = css("--accent");
  const band = (k, w, alpha) => {
    const s = line(chart, acc, w, { lineStyle: k === "p50" ? LC.LineStyle.Solid : LC.LineStyle.Dotted });
    s.applyOptions({ color: hexAlpha(acc, alpha) });
    s.setData([{ time: last, value: g.c[n0 - 1] }, ...series(future, ev[k])]);
    return s;
  };
  band("p95", 1, 0.35); band("p75", 1, 0.6); const med = band("p50", 2, 1); band("p25", 1, 0.6); band("p5", 1, 0.35);
  priceLine(med, a.plan.stop, css("--down"), "Stop");
  priceLine(med, a.plan.objectif_1, css("--up"), "Obj. 1");
  priceLine(med, a.plan.objectif_2, css("--up"), "Obj. 2");
  chart.timeScale().fitContent();
}

function hexAlpha(color, alpha) {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ------------------------------------------------------------------ connexion GitHub (portefeuille privé)

const GH = { owner: "thgnas", repo: "GEORJOTRAD", api: "https://api.github.com" };
const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new?name=GEORJOTRAD-site&description=Portefeuille%20GEORJOTRAD&target_name=thgnas&expires_in=none&contents=write";
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const token = () => store.get("token", "");
let CFG = null;        // config/portfolio.json : { data, sha }
let PF_ERR = "";
let pending = null;    // enregistrement en attente d'analyse par le robot

async function gh(path, opts = {}) {
  const r = await fetch(`${GH.api}/repos/${GH.owner}/${GH.repo}/${path}`, {
    ...opts, cache: "no-store",
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
  });
  if (!r.ok) {
    throw new Error({ 401: "Clé GitHub invalide ou expirée.", 403: "La clé n'a pas le droit d'écrire (Contents : Read and write).",
      404: "Dépôt introuvable avec cette clé : vérifie qu'elle donne accès à GEORJOTRAD.", 409: "Conflit", 422: "Conflit" }[r.status] || `GitHub HTTP ${r.status}`);
  }
  return r;
}
const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
function b64encode(s) {
  const b = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(out);
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function loadConfig() {
  const j = await (await gh("contents/config/portfolio.json")).json();
  CFG = { data: JSON.parse(b64decode(j.content)), sha: j.sha };
  CFG.data.positions ||= [];
  CFG.data.ventes ||= [];
  CFG.data.positions.forEach((p) => (p.id ||= newId()));
  return CFG;
}

async function saveConfig(mutate, message) {
  for (let essai = 0; essai < 3; essai++) {
    await loadConfig(); // toujours repartir de la dernière version
    mutate(CFG.data);
    try {
      const body = { message, content: b64encode(JSON.stringify(CFG.data, null, 2) + "\n"), sha: CFG.sha };
      const j = await (await gh("contents/config/portfolio.json", { method: "PUT", body: JSON.stringify(body) })).json();
      CFG.sha = j.content.sha;
      pending = { since: Date.now(), maj: PF && PF.maj };
      watchPending();
      return;
    } catch (e) {
      if (e.message !== "Conflit" || essai === 2) throw e;
    }
  }
}

async function refreshPF() {
  PF_ERR = "";
  try {
    if (token()) {
      const r = await gh("contents/site/data/portfolio.json", { headers: { Accept: "application/vnd.github.raw+json" } });
      PF = await r.json();
      await loadConfig();
    } else if (isLocal) {
      PF = await getJSON("data/portfolio.json");
    } else {
      PF = null;
    }
  } catch (e) {
    PF_ERR = e.message;
  }
}

function watchPending() {
  const tick = async () => {
    if (!pending) return;
    await refreshPF();
    if (PF && PF.maj !== pending.maj) {
      pending = null;
      toast("✓ Portefeuille analysé par le robot");
    } else if (Date.now() - pending.since > 5 * 60e3) {
      pending = null;
      toast("Le robot n'a pas encore répondu : l'analyse arrivera au prochain passage.");
    } else {
      setTimeout(tick, 15e3);
    }
    if (location.hash.startsWith("#/portefeuille") && !busy()) renderPortfolio();
  };
  setTimeout(tick, 20e3);
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

// ------------------------------------------------------------------ portefeuille

let pfView = store.get("pfView", "Tout");

function connectCard(full) {
  return `<div class="card ${full ? "" : "mt"}">
    <h2>${full ? "🔐 Connecte ton portefeuille" : "🔐 Connexion GitHub"}</h2>
    <p class="muted">Ton portefeuille est privé : il est enregistré dans ton dépôt privé GEORJOTRAD. Pour le voir et le modifier depuis ce site,
      cet appareil a besoin d'une <b>clé d'accès GitHub</b>. Elle reste uniquement dans ce navigateur, à faire une fois sur ton PC et une fois sur ton téléphone.</p>
    <ol class="steps mb">
      <li><span>Ouvre <a href="${TOKEN_URL}" target="_blank" rel="noopener">la création de clé sur GitHub</a>.</span></li>
      <li><span><b>Repository access</b> → <i>Only select repositories</i> → choisis <b>GEORJOTRAD</b>.</span></li>
      <li><span><b>Permissions</b> → <i>Contents</i> → <b>Read and write</b> (souvent déjà réglé par le lien).</span></li>
      <li><span>Clique sur <b>Generate token</b>, copie la clé (elle commence par <span class="mono">github_pat_</span>) et colle-la ici.</span></li>
    </ol>
    <div class="toolbar"><input id="tk" type="password" placeholder="github_pat_…" style="flex:1;min-width:220px" autocomplete="off">
      <button class="btn" id="tk-save">Connecter</button></div>
    <div id="tk-msg" class="muted"></div>
  </div>`;
}

function bindConnect() {
  const b = document.getElementById("tk-save");
  if (!b) return;
  b.onclick = async () => {
    const v = document.getElementById("tk").value.trim();
    const msg = document.getElementById("tk-msg");
    if (!v) return;
    store.set("token", v);
    msg.textContent = "Vérification…";
    await refreshPF();
    if (PF_ERR) { store.set("token", ""); msg.innerHTML = `<span class="down">${esc(PF_ERR)}</span>`; return; }
    toast("✓ Appareil connecté");
    renderPortfolio();
  };
}

function kpi(label, value, hint = "", klass = "") {
  return `<div class="card kpi"><div class="label">${label}</div><div class="value ${klass}">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
}

function renderPortfolio(prefillTicker) {
  const canEdit = !!token();
  if (!canEdit && !isLocal) {
    app.innerHTML = `<h1>Portefeuille</h1><p class="sub">Suivi de tes positions, conseils de vente et alertes sur ton téléphone.</p>${connectCard(true)}`;
    bindConnect();
    return;
  }
  const P = PF || { positions: [], total: {}, total_simule: {}, ventes: [], realise: {}, realise_simule: {} };
  const T = P.total || {}, TS = P.total_simule || {}, R = P.realise || {};
  const known = new Set(P.positions.map((p) => p.id));
  const waiting = canEdit && CFG ? CFG.data.positions.filter((p) => !known.has(p.id)) : [];
  const shown = P.positions.filter((p) => pfView === "Tout" || (pfView === "Simulé" ? p.simule : !p.simule));
  const alertes = P.positions.filter((p) => !p.simule && p.urgence >= 2).length;
  const options = [...SCAN.actifs].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((r) => `<option value="${esc(r.ticker)}" ${r.ticker === prefillTicker ? "selected" : ""}>${esc(r.nom)} (${esc(r.ticker)})</option>`).join("");

  app.innerHTML = `
    <h1>Portefeuille</h1>
    <p class="sub">${P.maj ? "Analysé le " + fmtDate(P.maj) + " · " : ""}stops, objectifs et conseils de vente recalculés toutes les 30 min pendant la séance.
      Point quotidien et alertes de vente envoyés sur ton téléphone (ntfy).</p>
    ${PF_ERR ? `<div class="banner down"><span class="dot"></span>${esc(PF_ERR)}</div>` : ""}
    ${pending ? `<div class="banner warn"><span class="dot"></span>Enregistré ✓ Le robot analyse ton portefeuille (environ 1 minute)…</div>` : ""}

    <div class="grid g4 mb">
      ${kpi("Valeur (réel)", eur(T.valeur, 0), `investi ${eur(T.investi, 0)}`)}
      ${kpi("Plus-value latente", eur(T.plus_value, 0), pct(T.plus_value_pct), cls(T.plus_value))}
      ${kpi("Plus-value réalisée", eur(R.plus_value, 0), R.nb ? `${R.gagnantes}/${R.nb} ventes gagnantes` : "aucune vente", cls(R.plus_value))}
      ${kpi("🧪 Simulé", eur(TS.valeur, 0), TS.nb ? `<span class="${cls(TS.plus_value)}">${eur(TS.plus_value, 0)} (${pct(TS.plus_value_pct)})</span>` : "aucune position virtuelle", "")}
    </div>
    ${riskCard(P.risque)}
    ${P.agenda && P.agenda.length ? `<div class="mb">${agendaCard(P.agenda, "📅 Agenda de tes positions")}</div>` : ""}

    <div class="toolbar">
      <div class="seg" id="pf-v">${["Tout", "Réel", "Simulé"].map((t) => `<button data-v="${t}" class="${pfView === t ? "on" : ""}">${t === "Simulé" ? "🧪 Simulé" : t}</button>`).join("")}</div>
      ${alertes ? `<span class="badge b-e">${alertes} position(s) à vendre ou à surveiller</span>` : ""}
      ${canEdit ? `<a href="#achat" class="btn" style="margin-left:auto" onclick="document.getElementById('achat').scrollIntoView({behavior:'smooth'});return false">+ Nouvel achat</a>` : ""}
    </div>

    ${waiting.length ? `<div class="grid g2 mb">${waiting.map((p) => `<div class="card pos u1"><b>${esc(p.ticker)}</b> ${p.simule ? '<span class="badge b-type">🧪 SIMULÉ</span>' : ""}
      <div class="muted">⏳ ${num(p.quantite, 0)} titres à ${num(p.prix_achat)} : en attente d'analyse par le robot.</div></div>`).join("")}</div>` : ""}
    ${shown.length ? `<div class="grid g2 mb">${shown.map((p) => positionCard(p, canEdit)).join("")}</div>`
      : waiting.length ? "" : `<div class="card empty mb">Aucune position${pfView !== "Tout" ? " dans cette vue" : ""}. ${canEdit ? "Ajoute ton premier achat (réel ou simulé) ci-dessous." : ""}</div>`}

    ${canEdit ? `<div class="card mb" id="achat">
      <h2>Nouvel achat</h2>
      <div class="grid g4 mb">
        <label class="f">Actif<select id="p-t">${options}</select></label>
        <label class="f">Quantité<input id="p-q" type="number" min="0" step="any" value="1"></label>
        <label class="f">Prix d'achat unitaire<input id="p-p" type="number" min="0" step="any"></label>
        <label class="f">Date d'achat<input id="p-d" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="f">Stop (optionnel)<input id="p-s" type="number" min="0" step="any" placeholder="plan GEORJOTRAD"></label>
        <label class="f">Objectif (optionnel)<input id="p-o" type="number" min="0" step="any" placeholder="plan GEORJOTRAD"></label>
        <label class="f">Note (optionnel)<input id="p-n" type="text" maxlength="120" placeholder="pourquoi cet achat ?"></label>
        <label class="f">Type<select id="p-sim"><option value="0">💶 Achat réel</option><option value="1">🧪 Achat simulé (virtuel)</option></select></label>
      </div>
      <div id="p-recap" class="muted mb"></div>
      <button class="btn" id="p-save">Enregistrer l'achat</button> <span id="p-msg" class="muted"></span>
    </div>` : ""}

    ${(P.ventes || []).length ? `<div class="card mb"><h2>Historique des ventes</h2><div class="table-wrap"><table>
      <thead><tr><th>Vente</th><th>Actif</th><th class="r">Qté</th><th class="r">Achat</th><th class="r">Vente</th><th class="r">Plus-value</th><th class="r">%</th><th class="r">Durée</th></tr></thead>
      <tbody>${P.ventes.map((v) => `<tr style="cursor:default"><td class="num">${fmtDate(v.date_vente, false)}</td>
        <td>${v.simule ? "🧪 " : ""}<b>${esc(v.nom || v.ticker)}</b> <span class="muted mono">${esc(v.ticker)}</span></td>
        <td class="r num">${num(v.quantite, 0)}</td><td class="r num">${num(v.prix_achat)}</td><td class="r num">${num(v.prix_vente)}</td>
        <td class="r num ${cls(v.plus_value)}"><b>${eur(v.plus_value, 0)}</b></td><td class="r num ${cls(v.plus_value_pct)}">${pct(v.plus_value_pct)}</td>
        <td class="r num">${v.date_achat && v.date_vente ? Math.round((new Date(v.date_vente) - new Date(v.date_achat)) / 864e5) + " j" : "—"}</td></tr>`).join("")}</tbody>
    </table></div></div>` : ""}

    ${canEdit ? `<p class="muted" style="font-size:12px">Appareil connecté à GitHub · <a href="#" id="tk-out">déconnecter cet appareil</a></p>` : connectCard(false)}`;

  document.querySelectorAll("#pf-v button").forEach((b) => b.onclick = () => { pfView = b.dataset.v; store.set("pfView", pfView); renderPortfolio(); });
  bindConnect();
  const out = document.getElementById("tk-out");
  if (out) out.onclick = (e) => { e.preventDefault(); if (confirm("Retirer la clé GitHub de cet appareil ?")) { store.set("token", ""); CFG = null; refreshPF().then(() => renderPortfolio()); } };
  if (canEdit) { bindBuy(); bindSell(); }
}

function bindBuy() {
  const $ = (id) => document.getElementById(id);
  const fill = () => {
    const r = SCAN.actifs.find((x) => x.ticker === $("p-t").value);
    if (!r) return;
    $("p-p").value = r.prix;
    $("p-q").value = Math.max(1, r.quantite || 1);
    recap();
  };
  const recap = () => {
    const r = SCAN.actifs.find((x) => x.ticker === $("p-t").value), q = +$("p-q").value, px = +$("p-p").value;
    $("p-recap").innerHTML = r ? `Montant <b>${eur(q * px, 0)}</b> · plan GEORJOTRAD : stop <b class="down">${num(r.stop)}</b>, objectifs <b class="up">${num(r.obj1)}</b> / <b class="up">${num(r.obj2)}</b>
      · signal ${badge(r.label)}${r.achat_fort ? " 🔥" : ""}` : "";
  };
  $("p-t").onchange = fill;
  ["p-q", "p-p"].forEach((id) => $(id).oninput = recap);
  fill();
  $("p-save").onclick = async () => {
    const r = SCAN.actifs.find((x) => x.ticker === $("p-t").value);
    const pos = { id: newId(), ticker: $("p-t").value, quantite: +$("p-q").value, prix_achat: +$("p-p").value, date_achat: $("p-d").value };
    if (!(pos.quantite > 0 && pos.prix_achat > 0 && pos.date_achat)) { $("p-msg").innerHTML = '<span class="down">Quantité, prix et date sont obligatoires.</span>'; return; }
    if (+$("p-s").value) pos.stop = +$("p-s").value;
    else if (r) pos.stop = +r.stop.toFixed(4);
    if (+$("p-o").value) pos.objectif = +$("p-o").value;
    else if (r) { pos.objectif = +r.obj2.toFixed(4); pos.objectif_1 = +r.obj1.toFixed(4); }
    if ($("p-n").value.trim()) pos.note = $("p-n").value.trim();
    if ($("p-sim").value === "1") pos.simule = true;
    $("p-save").disabled = true;
    $("p-msg").textContent = "Enregistrement…";
    try {
      await saveConfig((d) => d.positions.push(pos), `${pos.simule ? "Achat simulé" : "Achat"} : ${pos.quantite} × ${pos.ticker} à ${pos.prix_achat}`);
      toast("✓ Achat enregistré");
      renderPortfolio();
    } catch (e) {
      $("p-msg").innerHTML = `<span class="down">${esc(e.message)}</span>`;
      $("p-save").disabled = false;
    }
  };
}

function bindSell() {
  document.querySelectorAll("[data-sell]").forEach((b) => b.onclick = () => {
    const f = document.getElementById("sell-" + b.dataset.sell);
    f.hidden = !f.hidden;
  });
  document.querySelectorAll("[data-sell-ok]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.sellOk, p = PF.positions.find((x) => x.id === id);
    const q = +document.getElementById("sq-" + id).value, px = +document.getElementById("sp-" + id).value, d = document.getElementById("sd-" + id).value;
    const msg = document.getElementById("sm-" + id);
    if (!(q > 0 && q <= p.quantite && px > 0 && d)) { msg.innerHTML = '<span class="down">Vérifie la quantité, le prix et la date.</span>'; return; }
    b.disabled = true;
    msg.textContent = "Enregistrement…";
    try {
      await saveConfig((data) => {
        const pos = data.positions.find((x) => x.id === id);
        if (!pos) throw new Error("Position introuvable (déjà vendue ?)");
        data.ventes.push({ id: newId(), ticker: pos.ticker, nom: p.nom, quantite: q, prix_achat: pos.prix_achat, prix_vente: px,
          date_achat: pos.date_achat, date_vente: d, ...(pos.simule ? { simule: true } : {}) });
        if (q >= pos.quantite) data.positions = data.positions.filter((x) => x.id !== id);
        else pos.quantite = +(pos.quantite - q).toFixed(6);
      }, `${p.simule ? "Vente simulée" : "Vente"} : ${q} × ${p.ticker} à ${px}`);
      toast("✓ Vente enregistrée");
      renderPortfolio();
    } catch (e) {
      msg.innerHTML = `<span class="down">${esc(e.message)}</span>`;
      b.disabled = false;
    }
  });
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("Supprimer cette position sans l'enregistrer comme vente (erreur de saisie) ?")) return;
    try {
      await saveConfig((data) => { data.positions = data.positions.filter((x) => x.id !== b.dataset.del); }, "Suppression d'une position");
      renderPortfolio();
    } catch (e) { toast(e.message); }
  });
}

function positionCard(p, canEdit) {
  const sim = p.simule ? '<span class="badge b-type">🧪 SIMULÉ</span>' : "";
  if (p.erreur) return `<div class="card pos u1"><b>${esc(p.ticker)}</b> ${sim}<div class="muted">${esc(p.erreur)}</div></div>`;
  const cl = ["up", "accent", "warn", "down"][p.urgence];
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="card pos u${p.urgence}">
    <div class="pick-head"><div><a href="${assetLink(p.ticker)}" class="pick-name" style="color:var(--text)">${esc(p.nom)}</a> ${sim}
      <div class="muted mono" style="font-size:12px">${esc(p.ticker)} · ${num(p.quantite, 0)} titres depuis le ${fmtDate(p.date_achat, false)} (${p.jours_detention} j)</div></div>
      <span class="badge" style="background:var(--${cl}-soft);color:var(--${cl})">${esc(p.verdict)}</span></div>
    <div class="levels mt">
      <div class="lvl"><div class="k">Achat</div><div class="v">${num(p.prix_achat)}</div></div>
      <div class="lvl"><div class="k">Cours</div><div class="v ${cls(p.var_jour)}">${num(p.prix)}</div></div>
      <div class="lvl"><div class="k">Stop actif</div><div class="v down">${num(p.stop_actif)}</div></div>
      <div class="lvl"><div class="k">Objectif</div><div class="v up">${num(p.objectif_2)}</div></div>
    </div>
    <dl class="kv mt">
      <dt>Plus-value</dt><dd class="${cls(p.plus_value)}"><b>${eur(p.plus_value, 0)}</b> (${pct(p.plus_value_pct)})</dd>
      <dt>Valeur</dt><dd>${eur(p.valeur, 0)}</dd>
      <dt>Variation du jour</dt><dd class="${cls(p.var_jour)}">${pct(p.var_jour, 2)}</dd>
      <dt>Objectif 1 ${p.objectif_1_atteint ? "✓ atteint" : ""}</dt><dd>${num(p.objectif_1)}</dd>
      <dt>Plus haut depuis l'achat</dt><dd>${num(p.plus_haut_depuis_achat)}</dd>
      <dt>Score actuel</dt><dd>${num(p.score, 0)}/100</dd>
      ${p.note ? `<dt>Note</dt><dd style="font-family:inherit;white-space:normal">${esc(p.note)}</dd>` : ""}
    </dl>
    ${p.alertes.map((x) => `<div class="alert-line u${x.urgence}">${esc(x.message)}</div>`).join("")}
    ${canEdit && p.id ? `<div class="toolbar mt" style="margin-bottom:0">
      <button class="btn ${p.urgence >= 2 ? "" : "ghost"}" data-sell="${p.id}">Vendre</button>
      <button class="btn ghost" data-del="${p.id}" title="Erreur de saisie">Supprimer</button></div>
      <div id="sell-${p.id}" hidden class="sell-form">
        <div class="grid g3">
          <label class="f">Quantité vendue<input id="sq-${p.id}" type="number" min="0" max="${p.quantite}" step="any" value="${p.quantite}"></label>
          <label class="f">Prix de vente<input id="sp-${p.id}" type="number" min="0" step="any" value="${p.prix}"></label>
          <label class="f">Date<input id="sd-${p.id}" type="date" value="${today}"></label>
        </div>
        <button class="btn mt" data-sell-ok="${p.id}">Confirmer la vente</button> <span id="sm-${p.id}" class="muted"></span>
      </div>` : ""}
  </div>`;
}

// ------------------------------------------------------------------ simulateurs

function renderSimulators() {
  const etfs = SCAN.actifs.filter((r) => r.type === "ETF"), stocks = SCAN.actifs.filter((r) => r.type === "Action");
  const opt = (r) => `<option value="${esc(r.ticker)}">${esc(r.nom)} (${esc(r.ticker)})</option>`;
  const def = store.get("sim", { t: "CW8.PA", ini: 1000, mens: 200, ans: 15, hyp: "prudente", ps: 17.2, pfu: 30 });

  app.innerHTML = `
    <h1>Simulateurs</h1>
    <p class="sub">Projeter un investissement programmé sur PEA, dimensionner un trade, viser un objectif de patrimoine.</p>

    <div class="card mb">
      <h2>Versements programmés sur PEA (Monte-Carlo)</h2>
      <div class="grid g4 mb">
        <label class="f">Support<select id="s-t"><optgroup label="ETF">${etfs.map(opt).join("")}</optgroup><optgroup label="Actions">${stocks.map(opt).join("")}</optgroup></select></label>
        <label class="f">Versement initial (€)<input id="s-ini" type="number" min="0" step="100" value="${def.ini}"></label>
        <label class="f">Versement mensuel (€)<input id="s-mens" type="number" min="0" step="10" value="${def.mens}"></label>
        <label class="f">Durée (années)<input id="s-ans" type="number" min="1" max="40" value="${def.ans}"></label>
        <label class="f">Hypothèse de rendement<select id="s-hyp">
          <option value="prudente">Prudente : rendement historique divisé par 2</option>
          <option value="historique">Historique : rendement des 10 dernières années</option></select></label>
        <label class="f">Prélèvements sociaux PEA (%)<input id="s-ps" type="number" step="0.1" value="${def.ps}"></label>
        <label class="f">Flat tax CTO pour comparaison (%)<input id="s-pfu" type="number" step="0.1" value="${def.pfu}"></label>
        <div style="display:flex;align-items:flex-end"><button class="btn" id="s-run" style="width:100%">Simuler</button></div>
      </div>
      <div id="s-out"><div class="loading">Calcul…</div></div>
      <p class="muted" style="font-size:12px">2 000 trajectoires tirées dans les rendements hebdomadaires réels du support (blocs de 4 semaines). Fiscalité PEA après 5 ans : seuls les prélèvements sociaux s'appliquent sur les gains. Vérifie les taux en vigueur, ils peuvent changer avec les lois de finances.</p>
    </div>

    <div class="grid g2">
      <div class="card">
        <h2>Calculateur de position</h2>
        <div class="grid g2 mb">
          <label class="f">Capital (€)<input id="c-cap" type="number" value="${SCAN.parametres.capital}"></label>
          <label class="f">Risque par trade (%)<input id="c-risk" type="number" step="0.1" value="${SCAN.parametres.risque_par_trade_pct}"></label>
          <label class="f">Prix d'entrée<input id="c-in" type="number" step="any" value="100"></label>
          <label class="f">Stop<input id="c-stop" type="number" step="any" value="94"></label>
          <label class="f">Position max (% du capital)<input id="c-max" type="number" value="${SCAN.parametres.position_max_pct}"></label>
          <label class="f">Pré-remplir avec<select id="c-asset"><option value="">—</option>${SCAN.actifs.filter(isBuy).map(opt).join("")}</select></label>
        </div>
        <dl class="kv" id="c-out"></dl>
      </div>
      <div class="card">
        <h2>Objectif de patrimoine</h2>
        <div class="grid g2 mb">
          <label class="f">Capital visé (€)<input id="o-cible" type="number" step="1000" value="100000"></label>
          <label class="f">Déjà investi (€)<input id="o-ini" type="number" step="100" value="5000"></label>
          <label class="f">Durée (années)<input id="o-ans" type="number" min="1" value="15"></label>
          <label class="f">Rendement annuel supposé (%)<input id="o-r" type="number" step="0.5" value="6"></label>
        </div>
        <dl class="kv" id="o-out"></dl>
        <p class="muted" style="font-size:12px">Calcul à rendement constant, avant fiscalité. Un rendement de 5 à 7 % par an est une hypothèse courante pour un ETF actions monde sur longue période, sans garantie.</p>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  $("s-t").value = SCAN.actifs.some((r) => r.ticker === def.t) ? def.t : etfs[0]?.ticker;
  $("s-hyp").value = def.hyp;
  $("s-run").onclick = runDCA;
  ["s-t", "s-hyp"].forEach((id) => $(id).onchange = runDCA);
  runDCA();

  const calc = () => {
    const cap = +$("c-cap").value, risk = +$("c-risk").value / 100, e = +$("c-in").value, s = +$("c-stop").value, mx = +$("c-max").value / 100;
    const r = e - s;
    if (!(r > 0)) { $("c-out").innerHTML = `<dt class="down">Le stop doit être sous le prix d'entrée.</dt><dd></dd>`; return; }
    const q = Math.max(0, Math.min(Math.floor(cap * risk / r), Math.floor(cap * mx / e)));
    $("c-out").innerHTML = `
      <dt>Quantité à acheter</dt><dd><b>${q}</b></dd>
      <dt>Montant engagé</dt><dd>${eur(q * e, 0)} (${pct(q * e / cap, 1, false)} du capital)</dd>
      <dt>Perte si stop touché</dt><dd class="down">${eur(q * r, 0)} (${pct(-r / e)})</dd>
      <dt>Objectif 1 (2 R)</dt><dd class="up">${num(e + 2 * r)} → ${eur(q * 2 * r, 0)}</dd>
      <dt>Objectif 2 (3,5 R)</dt><dd class="up">${num(e + 3.5 * r)} → ${eur(q * 3.5 * r, 0)}</dd>
      <dt>Taux de réussite minimal pour être rentable</dt><dd>${prob(1 / (1 + 3.5))} (à 3,5 R)</dd>`;
  };
  $("c-asset").onchange = (ev) => {
    const r = SCAN.actifs.find((x) => x.ticker === ev.target.value);
    if (r) { $("c-in").value = r.entree.toFixed(2); $("c-stop").value = r.stop.toFixed(2); }
    calc();
  };
  ["c-cap", "c-risk", "c-in", "c-stop", "c-max"].forEach((id) => $(id).oninput = calc);
  calc();

  const obj = () => {
    const C = +$("o-cible").value, I = +$("o-ini").value, n = +$("o-ans").value * 12, r = Math.pow(1 + $("o-r").value / 100, 1 / 12) - 1;
    const fvIni = I * Math.pow(1 + r, n);
    const fac = r ? (Math.pow(1 + r, n) - 1) / r : n;
    const m = Math.max(0, (C - fvIni) / fac);
    const verse = I + m * n;
    $("o-out").innerHTML = `
      <dt>Versement mensuel nécessaire</dt><dd><b>${eur(m, 0)}</b></dd>
      <dt>Total versé</dt><dd>${eur(verse, 0)}</dd>
      <dt>Gains générés par le marché</dt><dd class="up">${eur(C - verse, 0)} (${pct(verse ? C / verse - 1 : 0, 0)})</dd>
      <dt>Plafond de versements PEA</dt><dd>${verse > 150000 ? '<span class="warn">dépassé (150 000 €)</span>' : "150 000 € · OK"}</dd>`;
  };
  ["o-cible", "o-ini", "o-ans", "o-r"].forEach((id) => $(id).oninput = obj);
  obj();
}

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function runDCA() {
  const $ = (id) => document.getElementById(id);
  const cfg = { t: $("s-t").value, ini: +$("s-ini").value || 0, mens: +$("s-mens").value || 0, ans: Math.min(40, Math.max(1, +$("s-ans").value || 1)),
    hyp: $("s-hyp").value, ps: +$("s-ps").value || 0, pfu: +$("s-pfu").value || 0 };
  store.set("sim", cfg);
  const out = $("s-out");
  out.innerHTML = `<div class="loading">Calcul…</div>`;
  let a;
  try { a = await getAsset(cfg.t); } catch { out.innerHTML = `<div class="empty">Données indisponibles pour ce support.</div>`; return; }

  const c = a.hebdo.c;
  let r = [];
  for (let i = 1; i < c.length; i++) if (c[i] > 0 && c[i - 1] > 0) r.push(Math.log(c[i] / c[i - 1]));
  if (r.length < 60) { out.innerHTML = `<div class="empty">Historique trop court pour simuler.</div>`; return; }
  const mean = r.reduce((x, y) => x + y, 0) / r.length;
  if (cfg.hyp === "prudente") r = r.map((x) => x - mean / 2);
  const annHist = Math.exp(mean * 52) - 1;

  const N = 2000, B = 4, W = cfg.ans * 52, months = cfg.ans * 12, rand = rng(42);
  const paths = Array.from({ length: months + 1 }, () => new Float64Array(N));
  for (let k = 0; k < N; k++) {
    let v = cfg.ini, m = 0, w = 0;
    paths[0][k] = v;
    while (w < W) {
      const s = Math.floor(rand() * (r.length - B));
      for (let j = 0; j < B && w < W; j++, w++) {
        v *= Math.exp(r[s + j]);
        const mm = Math.floor((w + 1) * 12 / 52);
        while (m < mm && m < months) { m++; v += cfg.mens; paths[m][k] = v; }
      }
    }
  }
  const q = (arr, p) => { const s = Array.from(arr).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const pcts = paths.map((col) => [0.1, 0.5, 0.9].map((p) => q(col, p)));
  const verse = (m) => cfg.ini + cfg.mens * m;
  const [p10, p50, p90] = pcts[months], V = verse(months);
  const netPEA = (x) => x - Math.max(0, x - V) * (cfg.ans >= 5 ? cfg.ps : cfg.pfu) / 100;
  const netCTO = (x) => x - Math.max(0, x - V) * cfg.pfu / 100;
  const pLoss = Array.from(paths[months]).filter((x) => x < V).length / N;

  out.innerHTML = `
    <div class="grid g4 mb">
      <div class="kpi"><div class="label">Total versé</div><div class="value">${eur(V, 0)}</div><div class="hint">rendement historique du support : ${pct(annHist)} / an</div></div>
      <div class="kpi"><div class="label">Scénario médian</div><div class="value">${eur(p50, 0)}</div><div class="hint up">${pct(p50 / V - 1, 0)} sur ${cfg.ans} ans</div></div>
      <div class="kpi"><div class="label">Pessimiste (10 %)</div><div class="value">${eur(p10, 0)}</div><div class="hint ${cls(p10 - V)}">${pct(p10 / V - 1, 0)}</div></div>
      <div class="kpi"><div class="label">Optimiste (90 %)</div><div class="value">${eur(p90, 0)}</div><div class="hint up">${pct(p90 / V - 1, 0)}</div></div>
    </div>
    <div id="c-dca" class="chart sm"></div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Médiane</span><span><i style="background:var(--accent);opacity:.4"></i>10 % – 90 %</span><span><i style="background:var(--muted)"></i>Total versé</span></div>
    <dl class="kv mt">
      <dt>Probabilité de finir sous le total versé</dt><dd class="${pLoss > 0.1 ? "warn" : ""}">${prob(pLoss)}</dd>
      <dt>Net après impôts, scénario médian, sur PEA</dt><dd class="up"><b>${eur(netPEA(p50), 0)}</b>${cfg.ans < 5 ? ' <span class="warn">(retrait avant 5 ans)</span>' : ""}</dd>
      <dt>Net après impôts, scénario médian, sur compte-titres</dt><dd>${eur(netCTO(p50), 0)}</dd>
      <dt>Économie d'impôt grâce au PEA</dt><dd class="up">${eur(netPEA(p50) - netCTO(p50), 0)}</dd>
    </dl>`;

  const chart = makeChart(document.getElementById("c-dca"), { localization: { locale: "fr-FR", priceFormatter: (p) => eur(p, 0) } });
  const start = new Date();
  const t = Array.from({ length: months + 1 }, (_, m) => { const d = new Date(start.getFullYear(), start.getMonth() + m, 1); return d.toISOString().slice(0, 10); });
  const acc = css("--accent");
  line(chart, hexAlpha(acc, 0.4), 1).setData(t.map((time, m) => ({ time, value: pcts[m][2] })));
  line(chart, acc, 2, { lastValueVisible: true }).setData(t.map((time, m) => ({ time, value: pcts[m][1] })));
  line(chart, hexAlpha(acc, 0.4), 1).setData(t.map((time, m) => ({ time, value: pcts[m][0] })));
  line(chart, css("--muted"), 1, { lineStyle: LC.LineStyle.Dashed }).setData(t.map((time, m) => ({ time, value: verse(m) })));
  chart.timeScale().fitContent();
}

// ------------------------------------------------------------------ méthode

function renderMethod() {
  const W = SCAN.parametres;
  app.innerHTML = `<div class="card prose">
    <h1>Méthode</h1>
    <p class="sub">Comment GEORJOTRAD calcule ses recommandations. Horizon visé : quelques semaines à quelques mois.</p>
    <h2>1. Données</h2>
    <p>Cours quotidiens sur 10 ans via Yahoo Finance (gratuit), pour des actions et ETF éligibles au PEA. Le robot tourne sur GitHub Actions : un scan complet chaque soir après la clôture, et une surveillance des positions toutes les 30 minutes pendant la séance.</p>
    <h2>2. Score technique (0 à 100)</h2>
    <ul>
      <li><b>Tendance (25 %)</b> : cours au-dessus des moyennes 50 et 200 jours, MM50 au-dessus de MM200, MM200 en hausse.</li>
      <li><b>Momentum (25 %)</b> : performance sur 12 mois hors dernier mois, sur 6 mois, et MACD.</li>
      <li><b>Force relative (15 %)</b> : performance sur 6 mois comparée au CAC 40 ou à l'Euro Stoxx 50.</li>
      <li><b>Risque (15 %)</b> : volatilité faible et proximité du plus haut annuel.</li>
      <li><b>Timing (20 %)</b> : on préfère un RSI autour de 50 et un cours proche de sa MM50, c'est-à-dire acheter un repli dans une tendance, pas un sommet.</li>
    </ul>
    <p>Quand le CAC 40 est sous sa moyenne 200 jours, tous les scores sont réduits de 15 %. Signaux : ≥ 75 achat fort, ≥ 62 achat, ≥ 45 neutre, ≥ 30 alléger, sinon éviter.</p>
    <h2>3. Plan de trade</h2>
    <p>Le stop est placé sous le plus bas des 20 dernières séances, entre 2 et 3 ATR sous le cours. L'objectif 1 vaut 2 fois le risque (2 R), l'objectif 2 vaut 3,5 R. La quantité est calculée pour ne perdre que ${num(W.risque_par_trade_pct, 1)} % du capital (${eur(W.capital, 0)}) si le stop est touché, avec un maximum de ${W.position_max_pct} % du capital par ligne.</p>
    <h2>4. Monte-Carlo</h2>
    <p>3 000 trajectoires sur ${W.horizon_jours} séances, construites en tirant des blocs de 5 jours dans les rendements réels des 3 dernières années. Cela conserve les krachs et la volatilité réelle. La tendance historique est divisée par deux pour rester prudent. On mesure la probabilité d'atteindre chaque objectif avant le stop.</p>
    <h2>5. Backtest</h2>
    <p>La même règle d'achat (score qui franchit ${W.score_achat_min}, cours au-dessus de la MM200) est rejouée sur 9 ans, avec stop, stop suiveur à 3 ATR, objectif, sortie si le score passe sous 40, et 0,2 % de frais. Le facteur de profit (gains ÷ pertes) indique si la méthode a fonctionné sur cet actif.</p>
    <h2>6. Conviction</h2>
    <p>Note combinée : 55 % du score, jusqu'à 30 points selon la probabilité Monte-Carlo, jusqu'à 15 points selon la fiabilité du backtest. Les alertes d'achat partent au-dessus de ${(W.alertes || W.whatsapp).conviction_alerte_achat}.</p>
    <h2>7. Conseils de vente</h2>
    <ul>
      <li><b>Vendre maintenant</b> : stop ou stop suiveur touché, ou chute brutale dans la journée.</li>
      <li><b>Action recommandée</b> : objectif final atteint, cassure de la MM200, ou score effondré sous 35.</li>
      <li><b>Vigilance</b> : objectif 1 atteint (stop remonté au prix d'achat) ou cours à moins de 2 % du stop.</li>
    </ul>
    <h2>Limites</h2>
    <p>Ce sont des probabilités calculées sur le passé, pas des certitudes. Les données gratuites peuvent avoir du retard ou des erreurs. GEORJOTRAD est une aide à la décision, pas un conseil en investissement : la décision finale t'appartient.</p>
  </div>`;
}

// ------------------------------------------------------------------ routeur

async function route(keepScroll = false) {
  clearCharts();
  const y = window.scrollY;
  const [page, arg] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === (page === "actif" ? "scanner" : page || "")));
  if (!keepScroll) window.scrollTo(0, 0);
  try {
    if (page === "scanner") renderScanner();
    else if (page === "actif" && arg) await renderAsset(decodeURIComponent(arg));
    else if (page === "achat-fort") renderStrongBuy();
    else if (page === "portefeuille") renderPortfolio(arg ? decodeURIComponent(arg) : null);
    else if (page === "simulateur") renderSimulators();
    else if (page === "methode") renderMethod();
    else renderDashboard();
    if (keepScroll) window.scrollTo(0, y);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card empty">Erreur d'affichage : ${esc(e.message)}</div>`;
  }
}

function setupTheme() {
  const saved = store.get("theme", null);
  if (saved) document.documentElement.dataset.theme = saved;
  document.getElementById("theme").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("theme", document.documentElement.dataset.theme);
    route();
  };
}

const busy = () => ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)
  || [...document.querySelectorAll(".sell-form")].some((f) => !f.hidden);

function updateMaj() {
  const min = Math.round((Date.now() - new Date(SCAN.maj)) / 60e3);
  const rel = min < 60 ? `il y a ${Math.max(0, min)} min` : min < 1440 ? `il y a ${Math.round(min / 60)} h` : fmtDate(SCAN.maj);
  document.getElementById("maj").textContent = "Analyse " + rel;
  document.getElementById("maj").title = "Dernière analyse : " + fmtDate(SCAN.maj) + " · actualisation automatique";
}

async function refreshData() {
  try {
    const s = await getJSON("data/scan.json");
    const changed = s.maj !== SCAN.maj;
    if (changed) {
      SCAN = s;
      Object.keys(assetCache).forEach((k) => delete assetCache[k]);
    }
    const before = PF && PF.maj;
    await refreshPF();
    updateMaj();
    if ((changed || (PF && PF.maj) !== before) && !busy()) {
      await route(true);
      if (changed) toast("Nouvelles analyses chargées");
    }
  } catch { /* hors ligne : on réessaiera */ }
}

async function init() {
  setupTheme();
  try {
    [SCAN] = await Promise.all([getJSON("data/scan.json"), refreshPF()]);
  } catch (e) {
    const local = location.protocol === "file:";
    app.innerHTML = `<div class="card empty"><h2>Données introuvables</h2>
      <p>${local ? "Le site ne peut pas lire ses données quand il est ouvert directement comme fichier. Lance <b>lancer-site.bat</b> à la racine du projet." : "Le robot n'a pas encore produit de scan. Lance le workflow « Scan complet » dans l'onglet Actions de GitHub."}</p>
      <p class="muted mono">${esc(e.message)}</p></div>`;
    return;
  }
  updateMaj();
  window.addEventListener("hashchange", () => route());
  matchMedia("(max-width: 640px)").addEventListener("change", () => { if (!busy()) route(true); });
  setInterval(refreshData, 3 * 60e3);
  setInterval(updateMaj, 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshData(); });
  route();
}

init();
