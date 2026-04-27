import type { EvaluationResult } from '../schemas/results.js'

const METRIC_LABELS: Record<string, string> = {
  faithfulness: 'Faithfulness',
  contextRelevance: 'Context Relevance',
  answerRelevance: 'Answer Relevance',
  contextRecall: 'Context Recall',
  contextPrecision: 'Context Precision',
  overall: 'Overall',
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
  faithfulness: 'Is the answer grounded in the retrieved context? High score = no hallucination.',
  contextRelevance:
    'Is the retrieved context relevant to the question? High score = precise retrieval.',
  answerRelevance: 'Does the answer actually address the question? High score = on-topic response.',
  contextRecall:
    'Does the context contain everything needed to answer? High score = thorough retrieval.',
  contextPrecision: 'What fraction of retrieved chunks are actually useful? High score = no noise.',
  overall: 'Average across all evaluated metrics.',
}

function scoreColor(score: number): string {
  if (score >= 0.8) return '#16a34a'
  if (score >= 0.6) return '#d97706'
  return '#dc2626'
}

function scoreBg(score: number): string {
  if (score >= 0.8) return '#f0fdf4'
  if (score >= 0.6) return '#fffbeb'
  return '#fef2f2'
}

function ring(score: number, size = 88): string {
  const r = size / 2 - 8
  const circ = 2 * Math.PI * r
  const filled = circ * score
  const color = scoreColor(score)
  const pct = Math.round(score * 100)
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="7"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7"
        stroke-dasharray="${filled} ${circ}" stroke-dashoffset="${circ * 0.25}"
        stroke-linecap="round"/>
      <text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
        font-size="15" font-weight="700" fill="${color}">${pct}%</text>
    </svg>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generates a self-contained, zero-dependency HTML evaluation report.
 *
 * The returned string is a complete HTML document that can be saved to a
 * `.html` file and opened in any browser — no server, no internet required.
 *
 * @param result  - The evaluation result from `evaluate()`.
 * @param title   - Optional report title shown in the header.
 * @returns Self-contained HTML string.
 *
 * @example
 * ```typescript
 * import { evaluate, toHtml } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * const result = await evaluate({ ... })
 * writeFileSync('report.html', toHtml(result))
 * ```
 */
export function toHtml(result: EvaluationResult, title = 'rageval Evaluation Report'): string {
  const { scores, samples, meta } = result
  const metricKeys = meta.metrics

  const scoreEntries = Object.entries(scores).filter(([, v]) => v !== undefined) as [
    string,
    number,
  ][]
  const overallScore = scores.overall

  // Score cards
  const scoreCards = scoreEntries
    .map(([key, val]) => {
      const label = METRIC_LABELS[key] ?? key
      const desc = METRIC_DESCRIPTIONS[key] ?? ''
      const color = scoreColor(val)
      const bg = scoreBg(val)
      return `
      <div class="score-card" style="border-top:3px solid ${color};background:${bg}" title="${escHtml(desc)}">
        <div class="ring">${ring(val)}</div>
        <div class="score-label">${escHtml(label)}</div>
        ${desc ? `<div class="score-desc">${escHtml(desc)}</div>` : ''}
      </div>`
    })
    .join('')

  // Sample table rows
  const tableRows = samples
    .map((sample, i) => {
      const sampleScores = metricKeys.map((m) => {
        const s = sample.scores[m]
        if (s === undefined) return '<td class="score-cell">—</td>'
        const color = scoreColor(s)
        const bg = scoreBg(s)
        return `<td class="score-cell"><span class="score-pill" style="color:${color};background:${bg}">${s.toFixed(3)}</span></td>`
      })

      const allVals = metricKeys
        .map((m) => sample.scores[m])
        .filter((s): s is number => s !== undefined)
      const sampleOverall =
        allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null
      const overallCell =
        sampleOverall !== null
          ? `<td class="score-cell"><span class="score-pill" style="color:${scoreColor(sampleOverall)};background:${scoreBg(sampleOverall)};font-weight:700">${sampleOverall.toFixed(3)}</span></td>`
          : '<td class="score-cell">—</td>'

      const reasoning =
        sample.reasoning && Object.keys(sample.reasoning).length > 0 ? sample.reasoning : null
      const reasoningRows = reasoning
        ? Object.entries(reasoning)
            .map(
              ([m, r]) =>
                `<div class="reasoning-entry"><span class="reasoning-metric">${escHtml(METRIC_LABELS[m] ?? m)}:</span> ${escHtml(r)}</div>`,
            )
            .join('')
        : ''
      const hasReasoning = reasoning !== null

      // reasoning row is hidden by default; display is toggled via toggleRow()
      const detailRow = hasReasoning
        ? `
      <tr class="reasoning-row" id="r${i}" style="display:none">
        <td colspan="${metricKeys.length + 3}" class="reasoning-cell">
          <div class="reasoning-box">${reasoningRows}</div>
        </td>
      </tr>`
        : ''

      const toggleBtn = hasReasoning
        ? `<button class="toggle-btn" onclick="toggleRow(${i})" title="Show reasoning">💬</button>`
        : ''

      return `
      <tr class="sample-row" data-overall="${sampleOverall ?? 0}" data-reasoning-id="${hasReasoning ? String(i) : ''}">
        <td class="idx-cell">${i + 1}</td>
        <td class="question-cell">${escHtml(sample.id ? `[${sample.id}] ` : '')}${escHtml(sample.question)}</td>
        ${sampleScores.join('')}
        ${overallCell}
        <td class="action-cell">${toggleBtn}</td>
      </tr>
      ${detailRow}`
    })
    .join('')

  const metricHeaders = metricKeys
    .map((m) => `<th class="metric-th">${escHtml(METRIC_LABELS[m] ?? m)}</th>`)
    .join('')

  const runDate = new Date(meta.startedAt).toLocaleString()
  const durationSec = (meta.durationMs / 1000).toFixed(1)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
    --text: #0f172a; --text-muted: #64748b;
    --accent: #6366f1; --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:         #0f172a;
      --surface:    #1e293b;
      --border:     #334155;
      --text:       #f1f5f9;
      --text-muted: #94a3b8;
    }
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5; min-height: 100vh; }

  /* Header */
  .header { background: var(--text); color: white; padding: 20px 32px; display: flex;
    align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: white; }
  .logo span { color: #818cf8; }
  .header-meta { font-size: 13px; color: #94a3b8; }
  .header-meta strong { color: #e2e8f0; }
  .overall-pill { background: ${scoreColor(overallScore)}22; border: 1px solid ${scoreColor(overallScore)}66;
    color: ${scoreColor(overallScore)}; padding: 6px 16px; border-radius: 20px;
    font-size: 15px; font-weight: 700; }

  /* Container */
  .container { max-width: 1100px; margin: 0 auto; padding: 24px 20px; }

  /* Meta bar */
  .meta-bar { display: flex; gap: 20px; flex-wrap: wrap; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px 20px; margin-bottom: 24px; }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-muted); }
  .meta-value { font-size: 14px; font-weight: 600; color: var(--text); }

  /* Scores grid */
  .section-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }
  .scores-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px; margin-bottom: 28px; }
  .score-card { border-radius: var(--radius); padding: 16px 14px; text-align: center;
    border: 1px solid var(--border); cursor: default; transition: transform 0.15s, box-shadow 0.15s; }
  .score-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .ring { display: flex; justify-content: center; margin-bottom: 8px; }
  .score-label { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .score-desc { font-size: 10px; color: var(--text-muted); line-height: 1.4; }

  /* Table section */
  .table-header { display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
  .table-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .search-input { padding: 7px 12px; border: 1px solid var(--border); border-radius: 7px;
    font-size: 13px; width: 220px; background: var(--surface); color: var(--text);
    outline: none; transition: border-color 0.15s; }
  .search-input:focus { border-color: var(--accent); }
  .filter-select { padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
    font-size: 13px; background: var(--surface); color: var(--text); cursor: pointer; }
  .table-wrap { background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  th { background: var(--bg); padding: 10px 12px; text-align: left; font-size: 11px;
    font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted);
    border-bottom: 1px solid var(--border); white-space: nowrap; cursor: pointer;
    user-select: none; transition: background 0.1s; }
  th:hover { background: var(--border); }
  th.sorted-asc::after { content: ' ↑'; }
  th.sorted-desc::after { content: ' ↓'; }
  .metric-th { min-width: 90px; }
  td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--border);
    vertical-align: middle; }
  .sample-row:last-child td { border-bottom: none; }
  .sample-row:hover td { background: var(--bg); }
  .idx-cell { color: var(--text-muted); font-size: 12px; width: 36px; }
  .question-cell { max-width: 300px; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .score-cell { text-align: center; }
  .score-pill { display: inline-block; padding: 3px 8px; border-radius: 5px;
    font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .action-cell { width: 40px; text-align: center; }
  .toggle-btn { background: none; border: 1px solid var(--border); border-radius: 5px;
    cursor: pointer; padding: 3px 6px; font-size: 13px; transition: background 0.1s; }
  .toggle-btn:hover { background: var(--border); }
  .reasoning-row td { padding: 0; }
  .reasoning-cell { background: var(--bg); }
  .reasoning-box { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
  .reasoning-entry { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .reasoning-metric { font-weight: 700; color: var(--text); }
  .no-results { text-align: center; padding: 32px; color: var(--text-muted); font-size: 14px; }

  /* Footer */
  .footer { text-align: center; padding: 24px; font-size: 11px; color: var(--text-muted); }
  .footer a { color: var(--accent); text-decoration: none; }

  /* Responsive */
  @media (max-width: 640px) {
    .header { padding: 14px 16px; }
    .container { padding: 16px 12px; }
    .scores-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
    .question-cell { max-width: 160px; }
  }
</style>
</head>
<body>

<header class="header">
  <div class="header-left">
    <div class="logo">rag<span>eval</span></div>
    <div class="header-meta">
      <strong>${escHtml(title)}</strong><br>
      ${escHtml(runDate)} &middot; ${escHtml(meta.provider)}/${escHtml(meta.model)}
    </div>
  </div>
  <div class="overall-pill">Overall ${Math.round(overallScore * 100)}%</div>
</header>

<div class="container">

  <div class="meta-bar">
    <div class="meta-item">
      <span class="meta-label">Samples</span>
      <span class="meta-value">${meta.totalSamples.toLocaleString()}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Metrics</span>
      <span class="meta-value">${metricKeys.length}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Provider</span>
      <span class="meta-value">${escHtml(meta.provider)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Model</span>
      <span class="meta-value">${escHtml(meta.model)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Duration</span>
      <span class="meta-value">${durationSec}s</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Generated</span>
      <span class="meta-value">${escHtml(new Date().toLocaleDateString())}</span>
    </div>
  </div>

  <div class="section-title">Aggregate Scores</div>
  <div class="scores-grid">${scoreCards}</div>

  <div class="table-header">
    <div class="section-title" style="margin-bottom:0">Sample Results</div>
    <div class="table-controls">
      <input class="search-input" type="text" id="searchInput"
        placeholder="Search questions…" oninput="filterTable()">
      <select class="filter-select" id="qualityFilter" onchange="filterTable()">
        <option value="all">All quality</option>
        <option value="good">Good (≥ 0.8)</option>
        <option value="warn">Fair (0.6–0.8)</option>
        <option value="bad">Poor (&lt; 0.6)</option>
      </select>
    </div>
  </div>

  <div class="table-wrap">
    <table id="sampleTable">
      <thead>
        <tr>
          <th onclick="sortTable(0)" title="Sort by index">#</th>
          <th onclick="sortTable(1)" title="Sort by question">Question</th>
          ${metricHeaders}
          <th class="metric-th" onclick="sortTable(${metricKeys.length + 2})" title="Sort by overall">Overall</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tableBody">${tableRows}</tbody>
    </table>
    <div class="no-results" id="noResults" style="display:none">No samples match the current filter.</div>
  </div>

</div>

<div class="footer">
  Generated by <a href="https://github.com/cloudserveinfotech/rageval" target="_blank">rageval</a>
  &mdash; <a href="https://cloudservelabs.com" target="_blank">CloudServe Labs</a>
</div>

<script>
  // Toggle reasoning detail row. Each sample row keeps a data-reasoning-id
  // attribute pointing to its sibling reasoning row so toggling works
  // correctly even after the table has been sorted or filtered.
  function toggleRow(i) {
    const el = document.getElementById('r' + i);
    if (!el) return;
    const isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display = isHidden ? 'table-row' : 'none';
  }

  let sortCol = -1, sortDir = 1;

  function sortTable(col) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    // Collect only the data rows (not reasoning rows)
    const rows = Array.from(tbody.querySelectorAll('tr.sample-row'));
    if (sortCol === col) { sortDir *= -1; } else { sortCol = col; sortDir = 1; }

    rows.sort((a, b) => {
      const aCell = a.cells[col];
      const bCell = b.cells[col];
      if (!aCell || !bCell) return 0;
      const aText = aCell.textContent?.trim() ?? '';
      const bText = bCell.textContent?.trim() ?? '';
      const aNum = parseFloat(aText);
      const bNum = parseFloat(bText);
      if (!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * sortDir;
      return aText.localeCompare(bText) * sortDir;
    });

    // Re-insert sorted data rows, each immediately followed by its reasoning
    // row (identified via data-reasoning-id, not the visible index cell).
    rows.forEach(row => {
      tbody.appendChild(row);
      const rid = row.dataset['reasoningId'];
      if (rid) {
        const rRow = document.getElementById('r' + rid);
        if (rRow) tbody.appendChild(rRow);
      }
    });

    // Update sort arrow indicators on column headers
    document.querySelectorAll('th').forEach((th, i) => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (i === col) th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
    });
  }

  function filterTable() {
    const search = (document.getElementById('searchInput')?.value ?? '').toLowerCase();
    const quality = document.getElementById('qualityFilter')?.value ?? 'all';
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    let visible = 0;

    tbody.querySelectorAll('tr.sample-row').forEach(row => {
      const question = row.cells[1]?.textContent?.toLowerCase() ?? '';
      const overall = parseFloat(row.dataset['overall'] ?? '1');
      const matchSearch = !search || question.includes(search);
      const matchQuality =
        quality === 'all' ? true :
        quality === 'good' ? overall >= 0.8 :
        quality === 'warn' ? (overall >= 0.6 && overall < 0.8) :
        overall < 0.6;

      const show = matchSearch && matchQuality;
      (row as HTMLElement).style.display = show ? '' : 'none';
      if (show) visible++;

      // Always hide the associated reasoning row when its parent is hidden,
      // and keep it in its prior state (hidden/shown) when parent is visible.
      const rid = (row as HTMLElement).dataset['reasoningId'];
      if (rid) {
        const rRow = document.getElementById('r' + rid);
        if (rRow && !show) rRow.style.display = 'none';
      }
    });

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.style.display = visible === 0 ? '' : 'none';
  }
</script>
</body>
</html>`
}
