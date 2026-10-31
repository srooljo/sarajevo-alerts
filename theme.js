export const CSS = `
* { box-sizing: border-box; }
.sa-root {
  --k-power: #e9a10c; --k-water: #2f80ed; --k-heating: #e5533d; --k-traffic: #8a63f2;
  min-height: 100%; background: var(--bg); color: var(--text);
  font-family: var(--font); font-size: 15px; line-height: 1.4;
  padding: 18px 16px 40px; max-width: 760px; margin: 0 auto;
}
.sa-root button { font: inherit; color: inherit; }
.sa-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.sa-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sa-over { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.sa-title { font-size: 24px; font-weight: 700; letter-spacing: -.02em; margin: 2px 0 0; }
.sa-refresh {
  display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--surface);
  color: var(--muted); font-size: 13px; cursor: pointer; white-space: nowrap;
}
.sa-refresh:hover { color: var(--text); }
.sa-spin { animation: sa-spin 1s linear infinite; }
@keyframes sa-spin { to { transform: rotate(360deg); } }

.sa-tabs { display: flex; gap: 4px; margin: 16px 0 14px; padding: 4px; background: var(--surface-2); border-radius: 12px; }
.sa-tab { flex: 1; min-height: 40px; border: 0; border-radius: 9px; background: transparent; cursor: pointer; font-weight: 600; color: var(--muted); }
.sa-tab[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }

.sa-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sa-tile {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  min-height: 92px; padding: 10px; border-radius: 14px; cursor: pointer; text-align: left;
  border: 1px solid var(--border); background: var(--surface); overflow: hidden;
  transition: transform .15s ease, border-color .15s ease;
}
.sa-tile::after { content: ""; position: absolute; inset: auto 0 0 0; height: 3px; background: var(--kc); opacity: .9; }
.sa-tile:hover { transform: translateY(-1px); }
.sa-tile[aria-pressed="true"] { border-color: var(--kc); background: color-mix(in srgb, var(--kc) 12%, var(--surface)); }
.sa-tile-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; background: var(--kc); }
.sa-tile-n { font-size: 22px; font-weight: 700; line-height: 1; }
.sa-tile-l { font-size: 12px; color: var(--muted); font-weight: 600; }
.sa-tile-live { position: absolute; top: 10px; right: 10px; width: 8px; height: 8px; border-radius: 50%; background: var(--kc); box-shadow: 0 0 0 0 var(--kc); animation: sa-pulse 2s infinite; }
@keyframes sa-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--kc) 60%, transparent); } 70% { box-shadow: 0 0 0 8px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }

.sa-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 14px 0 4px; flex-wrap: wrap; }
.sa-chip {
  display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px;
  border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  cursor: pointer; font-size: 13px; font-weight: 600;
}
.sa-chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.sa-hint { color: var(--muted); font-size: 13px; }

.sa-day { margin: 20px 0 8px; font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
.sa-card {
  position: relative; display: block; width: 100%; text-align: left; cursor: pointer;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 12px 12px 12px 16px; margin-bottom: 8px; overflow: hidden;
}
.sa-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--kc); }
.sa-card.mine { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
.sa-card.ended { opacity: .55; }
.sa-card.flash { animation: sa-flash 1.6s ease 2; }
@keyframes sa-flash { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 45%, transparent); } }
.sa-card-top { display: flex; align-items: center; gap: 8px; }
.sa-card-ico { flex: none; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: var(--kc); background: color-mix(in srgb, var(--kc) 14%, transparent); }
.sa-card-title { font-weight: 650; flex: 1; min-width: 0; }
.sa-badge { flex: none; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); }
.sa-badge.now { background: var(--kc); color: #fff; }
.sa-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 6px 0 0 34px; font-size: 13px; color: var(--muted); }
.sa-meta b { color: var(--text); font-weight: 600; }
.sa-hoods { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0 0 34px; }
.sa-hoods span { font-size: 12.5px; font-weight: 650; padding: 3px 9px; border-radius: 999px; color: var(--text); background: color-mix(in srgb, var(--kc) 16%, var(--surface-2)); border: 1px solid color-mix(in srgb, var(--kc) 35%, transparent); }
.sa-streets { margin: 6px 0 0 34px; font-size: 13px; color: var(--muted); }
.sa-mine { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0 34px; }
.sa-mine span { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 3px 8px; border-radius: 999px; }
.sa-more { margin: 10px 0 0 34px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 13.5px; }
.sa-more table { width: 100%; border-collapse: collapse; }
.sa-more td { padding: 4px 6px 4px 0; vertical-align: top; border-bottom: 1px solid var(--border); }
.sa-more td:first-child { font-weight: 600; white-space: nowrap; }
.sa-more td:last-child { color: var(--muted); word-break: break-word; }
.sa-more p { margin: 0 0 8px; white-space: pre-line; }
.sa-link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; text-decoration: none; min-height: 32px; }

.sa-empty { text-align: center; padding: 34px 16px; color: var(--muted); border: 1px dashed var(--border); border-radius: 14px; margin-top: 16px; }
.sa-empty strong { display: block; color: var(--text); font-size: 16px; margin-bottom: 4px; }
.sa-earlier { width: 100%; min-height: 40px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; font-weight: 600; }

.sa-sources { margin-top: 28px; font-size: 12.5px; color: var(--muted); }
.sa-sources ul { list-style: none; padding: 0; margin: 6px 0 0; display: grid; gap: 4px; }
.sa-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: #2bb673; }
.sa-dot.bad { background: #e5533d; }

/* My places */
.sa-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px; }
.sa-panel h3 { margin: 0 0 4px; font-size: 16px; }
.sa-panel + .sa-panel { margin-top: 12px; }
.sa-seg { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--surface-2); margin: 10px 0; }
.sa-seg button { flex: 1; min-height: 38px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--muted); }
.sa-seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); }
.sa-row { display: flex; gap: 8px; }
.sa-input { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
.sa-input.num { flex: 0 0 84px; }
.sa-munis { display: flex; flex-wrap: wrap; gap: 6px; }
.sa-label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); margin: 12px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
.sa-kinds { display: flex; flex-wrap: wrap; gap: 6px; }
.sa-kchip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px 0 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); }
.sa-kchip[aria-pressed="true"] { border-color: var(--kc); color: var(--text); background: color-mix(in srgb, var(--kc) 12%, var(--surface)); }
.sa-kchip i { width: 10px; height: 10px; border-radius: 50%; background: var(--kc); opacity: .35; }
.sa-kchip[aria-pressed="true"] i { opacity: 1; }
.sa-primary { width: 100%; min-height: 46px; margin-top: 14px; border: 0; border-radius: 12px; background: var(--accent); color: #fff !important; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.sa-primary:disabled { opacity: .45; cursor: default; }
.sa-place { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
.sa-place:first-of-type { border-top: 0; }
.sa-place-main { flex: 1; min-width: 0; }
.sa-place-name { font-weight: 650; }
.sa-place-sub { font-size: 12.5px; color: var(--muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.sa-place-sub i { width: 8px; height: 8px; border-radius: 50%; background: var(--kc); display: inline-block; }
.sa-icon-btn { flex: none; width: 44px; height: 44px; border-radius: 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center; }
.sa-icon-btn:hover { background: var(--surface-2); color: var(--text); }
.sa-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; cursor: pointer; }
.sa-toggle { flex: none; width: 46px; height: 28px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); position: relative; transition: background .2s; }
.sa-toggle::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .2s; }
.sa-toggle[aria-checked="true"] { background: var(--accent); border-color: var(--accent); }
.sa-toggle[aria-checked="true"]::after { transform: translateX(18px); }
.sa-err { margin-top: 10px; color: #e5533d; font-size: 13px; }

@media (prefers-reduced-motion: reduce) {
  .sa-root *, .sa-root *::before, .sa-root *::after { animation: none !important; transition: none !important; }
}
`
