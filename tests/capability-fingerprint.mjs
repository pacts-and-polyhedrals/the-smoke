// Everything a feature leaves behind in the code, templates and data — handlers, settings, exports, hooks, buttons,
// API keys, templates, data counts — read straight from the source tree. The capability guard compares this with
// tests/capability-baseline.json, so an upgrade that silently drops any of it fails the tests (0.5.25).
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'tests', 'scripts', 'packs'].includes(e.name)) walk(p, exts, out); }
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}
const add = (out, k, v) => (out[k] ??= new Set()).add(v);
/** The fingerprint of the system at `root`: {category: sorted names}. */
export function fingerprint(root) {
  const out = {};
  const js = walk(path.join(root, 'module'), ['.mjs']).concat(fs.existsSync(path.join(root, 'the-smoke.mjs')) ? [path.join(root, 'the-smoke.mjs')] : []);
  for (const f of js) {
    const s = fs.readFileSync(f, 'utf8'), rel = path.relative(root, f).split(path.sep).join('/');
    add(out, 'module', rel);
    for (const m of s.matchAll(/registerHandler\(\s*['"]([\w.]+)['"]/g)) add(out, 'handler', m[1]);
    for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/g)) add(out, 'export', `${rel}:${m[1]}`);
    for (const m of s.matchAll(/Hooks\.(?:on|once)\(\s*['"](\w+)['"]/g)) add(out, 'hook', m[1]);
    for (const m of s.matchAll(/Hooks\.callAll\(\s*['"](\w+)['"]/g)) add(out, 'firedHook', m[1]);
    for (const m of s.matchAll(/keybindings\.register\(\s*\w+\s*,\s*['"](\w+)['"]/g)) add(out, 'keybinding', m[1]);
    for (const m of s.matchAll(/registerMenu\(\s*\w+\s*,\s*['"](\w+)['"]/g)) add(out, 'settingMenu', m[1]);
    for (const m of s.matchAll(/(?:settings\.register|\breg)\(\s*(?:NS\s*,\s*|['"]the-smoke['"]\s*,\s*)?['"](\w+)['"]\s*,\s*\{/g)) add(out, 'setting', m[1]);
    for (const m of s.matchAll(/\bon\(\s*['"]\[(data-[\w-]+)/g)) add(out, 'uiAction', m[1]);
    for (const m of s.matchAll(/\bact\(\s*['"]\[(data-[\w-]+)/g)) add(out, 'uiAction', m[1]);
  }
  // game.smoke's top-level keys
  const entry = path.join(root, 'the-smoke.mjs');
  if (fs.existsSync(entry)) {
    const s = fs.readFileSync(entry, 'utf8'), i = s.indexOf('game.smoke = {');
    if (i >= 0) {
      let depth = 0, body = '', j = i + 'game.smoke = '.length;
      for (let k = j; k < s.length; k++) { const c = s[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { body = s.slice(j + 1, k); break; } } }
      let d = 0, tok = ''; const keys = [];
      for (const c of body) { if ('{[('.includes(c)) d++; else if ('}])'.includes(c)) d--; if (!d && c === ',') { keys.push(tok); tok = ''; } else tok += c; }
      keys.push(tok);
      for (const t of keys) { const m = /^\s*(\w+)\s*(?::|$)/.exec(t.replace(/\/\/[^\n]*\n/g, '\n')); if (m) add(out, 'api', m[1]); }
    }
  }
  for (const f of walk(path.join(root, 'templates'), ['.hbs', '.html'])) {
    const s = fs.readFileSync(f, 'utf8'), b = path.basename(f);
    add(out, 'template', b);
    for (const m of s.matchAll(/\b(data-[\w-]+)/g)) add(out, 'templateAttr', `${b}:${m[1]}`);
  }
  for (const f of walk(path.join(root, 'styles'), ['.css'])) add(out, 'style', path.basename(f));
  for (const f of walk(path.join(root, 'data'), ['.json'])) add(out, 'dataFile', path.basename(f));
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}
/** Counts that must never fall (content, maps, people, guides). */
export function contentCounts(root) {
  const J = n => { try { return JSON.parse(fs.readFileSync(path.join(root, 'data', n), 'utf8')); } catch (_e) { return null; } };
  const count = (dir, exts) => walk(path.join(root, dir), exts).length;
  const content = J('content.json'), missions = J('london-missions.json'), tags = J('tagging-missions.json'), radio = J('radio-war-missions.json');
  const venues = J('london-venues.json'), cast = J('london-cast.json'), items = J('london-items.json'), catalogue = J('tagging-catalogue.json'), tb = J('token-builder.json');
  const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  return {
    items: items?.items?.length ?? 0,
    londonMissions: missions?.missions?.length ?? 0, taggingMissions: tags?.missions?.length ?? 0, radioWarMissions: radio?.missions?.length ?? 0,
    venues: (venues?.maps ?? []).length, places: (J('london-places.json')?.maps ?? []).length, cast: arr(cast?.cast ?? cast?.people ?? cast).length,
    journals: content?.journals?.length ?? 0, journalPages: (content?.journals ?? []).reduce((n, j) => n + j.pages.length, 0),
    tagSites: arr(catalogue?.sites).length, tokenParts: (tb?.parts ?? []).filter(p => p.file).length, tokenPresets: (tb?.presets ?? []).length,
    assets: count('assets', ['.webp', '.png', '.svg', '.jpg', '.mp3', '.ogg', '.woff2', '.ttf']),
    packs: fs.existsSync(path.join(root, 'packs')) ? fs.readdirSync(path.join(root, 'packs'), {withFileTypes: true}).filter(e => e.isDirectory() && !e.name.startsWith('.')).length : 0
  };
}
