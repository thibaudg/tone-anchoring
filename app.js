/* ==========================================================================
   Tone Anchoring — app logic
   Data: Supabase (tables entries, inbox, history; view repo_stats; rpc undo_change).
   Without Supabase keys in config.js the app runs in demo mode on sample data.
   ========================================================================== */

const TONE_NAME = { 1: 'flat', 2: 'rising', 3: 'dip-rise', 4: 'falling', 5: 'neutral' };
const GROUPS = [['tone', 'Tone'], ['radical', 'Radical'], ['hsk', 'HSK level'], ['date', 'Date added'], ['none', 'None']];
const SORTS = [['pinyin', 'Pinyin A–Z'], ['recent', 'Recently changed']];
const DEMO = !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || /[?&]demo\b/.test(location.search);

const state = {
  entries: [], inbox: [], loaded: false, lastLoad: 0,
  filter: 'all', q: '',
  openId: null, editId: null,
  openInboxId: null, editInboxId: null, showProcessed: false,
  addRef: null,
  openChangeId: null,
  prefs: { group: 'tone', sort: 'pinyin', tones: [1, 2, 3, 4, 5] },
};
let api = null;
let currentUserId = null;

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
function el(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
function norm(s){ return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function toneOf(e){ return (e.tones && e.tones[0]) || 5; }
function toneLabel(t){ return t === 5 ? 'Neutral tone' : `Tone ${t} · ${TONE_NAME[t]}`; }
function lsGet(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200); }
function fail(ex){ console.error(ex); toast((ex && ex.message) ? `Couldn't save: ${ex.message}` : "Something went wrong. Try again."); }
function when(iso){
  const d = new Date(iso), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if(diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if(diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function dayLabel(iso){
  const d = new Date(iso), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if(diff === 0) return 'Today';
  if(diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
function snippet(s, n = 60){ s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ==========================================================================
   Data layer
   ========================================================================== */
function supabaseApi(){
  // Tables live in the `tones` schema of the Matrix & Mind project
  const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, { db: { schema: 'tones' } });
  const chk = (r) => { if(r.error) throw r.error; return r.data; };
  return {
    supa,
    async entries(){ return chk(await supa.from('entries').select('*').order('pinyin_plain')); },
    async inbox(){ return chk(await supa.from('inbox').select('*').order('created_at', { ascending: false })); },
    async stats(){ return chk(await supa.from('repo_stats').select('*').single()); },
    async history(limit = 150){ return chk(await supa.from('history').select('*').order('changed_at', { ascending: false }).limit(limit)); },
    async updateEntry(id, patch){ return chk(await supa.from('entries').update(patch).eq('id', id).select().single()); },
    async addInbox(body, aboutId){ return chk(await supa.from('inbox').insert({ body, about_entry_id: aboutId || null }).select().single()); },
    async updateInbox(id, body){ return chk(await supa.from('inbox').update({ body }).eq('id', id).eq('status', 'pending').select().single()); },
    async deleteInbox(id){ chk(await supa.from('inbox').delete().eq('id', id)); },
    async undo(historyId){ chk(await supa.rpc('undo_change', { p_history_id: historyId })); },
  };
}

function demoApi(){
  const now = Date.now(), day = 86400000;
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  let n = 0; const id = () => 'demo-' + (++n);
  const E = (kind, hanzi, pinyin, tones, meaning, scene, extra = {}, age = 30) => ({
    id: id(), kind, hanzi, pinyin, tones, meaning, scene,
    pinyin_plain: norm(pinyin).replace(/ü/g, 'u'),
    components: null, radical: null, hsk_level: null, collision_guard: null, tags: [], status: 'locked', notes: null,
    created_at: iso(age * day), updated_at: iso(age * day), ...extra,
  });
  const entries = [
    E('character', '紧', 'jǐn', [3], 'tight / firm / urgent', 'Pulling a knot tight. You yank the rope ends downward (the dip), and the loop snaps tight, pulling everything taut and upward (the rise).', { components: '又 (hand) over 糸 (silk thread): hand pulling thread tight', radical: '糸' }, 3),
    E('character', '等', 'děng', [3], 'to wait', 'Sample story: at the tram stop you dip to read the timetable, then rise onto your toes to look down the line, again and again.', { components: '⺮ (bamboo) + 寺', radical: '⺮', hsk_level: 2 }, 70),
    E('character', '读', 'dú', [2], 'to read', 'Sample story: at the blackboard, your voice rises line by line as you read aloud.', { components: '讠 (speech) + 卖', radical: '讠', hsk_level: 1, collision_guard: 'Also at the blackboard: 孩. 读 is the rising voice, 孩 is the child.' }, 90),
    E('character', '进', 'jìn', [4], 'to enter', 'Sample story: you stride through the doorway and drop your bag on the floor with a thud.', { components: '辶 (walk) + 井', radical: '辶', hsk_level: 2 }, 40),
    E('character', '今', 'jīn', [1], 'today, now', 'Sample story: a flat horizon at dawn, the line of today stretching out evenly.', { components: '人 + 一', radical: '人', hsk_level: 1 }, 12),
    E('character', '经', 'jīng', [1], 'to pass through', 'Sample story: a long flat conveyor belt carries everything past you.', { components: '纟 (silk) + phonetic', radical: '纟', hsk_level: 2 }, 120),
    E('character', '知', 'zhī', [1], 'to know', 'Sample story: an arrow flies level and straight to the mouth: you just know.', { components: '矢 (arrow) + 口 (mouth)', radical: '矢', hsk_level: 1 }, 110),
    E('character', '得', 'de', [5], 'particle of degree or manner', 'Sample story: in a busy courtroom the judge rests the gavel on the bench, unstruck.', { radical: '彳', hsk_level: 1 }, 60),
    E('character', '的', 'de', [5], 'possessive particle', 'Sample story: dust settling softly on a shelf.', { radical: '白', hsk_level: 1, status: 'needs_rebuild' }, 150),
    E('character', '觉', 'jué', [2], 'to feel', 'Sample story: a sudden realisation lifts your eyebrows upward.', { radical: '见', hsk_level: 1 }, 100),
    E('character', '觉', 'jiào', [4], 'sleep', 'Sample story: you drop face-first into the pillow.', { radical: '见' }, 99),
    E('word', '声音', 'shēngyīn', [1, 1], 'sound / voice', 'Two different flats side by side: the electronic, continuous flat of a dial tone for 声, then the acoustic, lingering flat of a bell hum for 音.', {}, 50),
    E('word', '时候', 'shíhou', [2, 5], 'time, moment', 'Sample story: the clock hand sweeps up to the hour, then 候 settles quietly.', { hsk_level: 1 }, 45),
    E('word', '紧张', 'jǐnzhāng', [3, 1], 'nervous', 'Sample story: the knot pulls tight, then the rope hums flat and taut.', {}, 5),
  ];
  const inbox = [
    { id: id(), body: '视 vs 看: when do I use which?', status: 'pending', about_entry_id: null, result_note: null, entry_ids: [], created_at: iso(2 * 3600000), processed_at: null },
    { id: id(), body: '经常: the two tones blur together in the compound', status: 'pending', about_entry_id: null, result_note: null, entry_ids: [], created_at: iso(day + 3600000), processed_at: null },
    { id: id(), body: "The knot doesn't fire anymore. Try something with a belt being pulled tight.", status: 'pending', about_entry_id: entries[0].id, result_note: null, entry_ids: [], created_at: iso(day + 7200000), processed_at: null },
    { id: id(), body: '等 feels like 4-then-2', status: 'processed', about_entry_id: null, result_note: 'Updated 等 · scene', entry_ids: [entries[1].id], created_at: iso(4 * day), processed_at: iso(3 * day) },
    { id: id(), body: '紧张 came up in today\'s lesson', status: 'processed', about_entry_id: null, result_note: 'Added 紧张', entry_ids: [entries[13].id], created_at: iso(6 * day), processed_at: iso(5 * day) },
  ];
  let hid = 0;
  const history = [];
  const log = (table, row, action, before, after, source = 'app', at = new Date().toISOString()) =>
    history.unshift({ id: ++hid, table_name: table, row_id: row, action, before: before ? { ...before } : null, after: after ? { ...after } : null, source, changed_at: at });
  log('entries', entries[13].id, 'insert', null, entries[13], 'claude', iso(5 * day));
  log('entries', entries[1].id, 'update', { ...entries[1], scene: 'Sample story: an older version of the 等 scene.' }, entries[1], 'claude', iso(3 * day));
  log('entries', entries[0].id, 'update', { ...entries[0], components: '又 + 糸' }, entries[0], 'app', iso(3 * 3600000));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const delay = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 60));
  return {
    async entries(){ return delay(entries); },
    async inbox(){ return delay(inbox); },
    async stats(){
      const ch = entries.filter(e => e.kind === 'character');
      return delay({ characters: new Set(ch.map(e => e.hanzi)).size, readings: ch.length, words: entries.length - ch.length, needs_rebuild: entries.filter(e => e.status === 'needs_rebuild').length });
    },
    async history(){ return delay(history); },
    async updateEntry(eid, patch){
      const e = entries.find(x => x.id === eid); const before = { ...e };
      Object.assign(e, patch, { updated_at: new Date().toISOString() }); log('entries', eid, 'update', before, e); return delay(e);
    },
    async addInbox(body, aboutId){
      const it = { id: id(), body, status: 'pending', about_entry_id: aboutId || null, result_note: null, entry_ids: [], created_at: new Date().toISOString(), processed_at: null };
      inbox.unshift(it); log('inbox', it.id, 'insert', null, it); return delay(it);
    },
    async updateInbox(iid, body){ const it = inbox.find(x => x.id === iid); const before = { ...it }; it.body = body; log('inbox', iid, 'update', before, it); return delay(it); },
    async deleteInbox(iid){ const i = inbox.findIndex(x => x.id === iid); log('inbox', iid, 'delete', inbox[i], null); inbox.splice(i, 1); return delay(null); },
    async undo(hidToUndo){
      const h = history.find(x => x.id === hidToUndo);
      if(!h || h.table_name !== 'entries') throw new Error('Undo is only available for entries');
      const i = entries.findIndex(x => x.id === h.row_id);
      if(h.action === 'insert'){ log('entries', h.row_id, 'delete', entries[i], null); entries.splice(i, 1); }
      else if(i >= 0){ const before = { ...entries[i] }; Object.assign(entries[i], h.before); log('entries', h.row_id, 'update', before, entries[i]); }
      else { entries.push({ ...h.before }); log('entries', h.row_id, 'insert', null, h.before); }
      return delay(null);
    },
  };
}

/* ==========================================================================
   Loading
   ========================================================================== */
async function loadAll(){
  try{
    const [entries, inbox] = await Promise.all([api.entries(), api.inbox()]);
    state.entries = entries.map(e => ({ ...e, _plain: norm(e.pinyin_plain || e.pinyin).replace(/ /g, '') }));
    state.inbox = inbox;
    state.loaded = true; state.lastLoad = Date.now();
    render();
  }catch(ex){
    console.error(ex);
    $('list').replaceChildren(el('div', 'empty', `Couldn't load your repository. ${ex.message || ''}`));
  }
}

/* ==========================================================================
   Search, filter, group
   ========================================================================== */
function parseQuery(){
  const raw = state.q.trim();
  const q = norm(raw);
  const m = q.match(/^([a-z]+)([1-5])$/);   // "jin3" = pinyin + tone
  return { raw, q, compact: q.replace(/ /g, ''), py: m ? m[1] : null, tone: m ? +m[2] : null };
}
function entryMatches(e, Q){
  if(!Q.q) return true;
  if(Q.py) return e._plain.includes(Q.py) && e.tones.includes(Q.tone);
  if(e.hanzi.includes(Q.raw)) return true;
  if(e._plain.includes(Q.compact)) return true;
  const hay = norm([e.meaning, e.components, e.scene, e.notes, e.radical, (e.tags || []).join(' ')].join(' '));
  return hay.includes(Q.q);
}
function inboxMatches(it, Q){
  if(!Q.q) return true;
  return it.body.includes(Q.raw) || norm(it.body).includes(Q.q);
}
function toneAllowed(e){
  const set = state.prefs.tones;
  if(set.length === 5) return true;
  return e.kind === 'character' ? set.includes(toneOf(e)) : e.tones.some(t => set.includes(t));
}
function sortEntries(list){
  const s = state.prefs.sort;
  return list.sort((a, b) => s === 'recent'
    ? (b.updated_at || '').localeCompare(a.updated_at || '')
    : a._plain.localeCompare(b._plain) || toneOf(a) - toneOf(b) || a.hanzi.localeCompare(b.hanzi));
}
function groupEntries(list){
  const g = state.prefs.group;
  const map = new Map();
  const put = (key, label, order, e) => { if(!map.has(key)) map.set(key, { label, order, items: [] }); map.get(key).items.push(e); };
  for(const e of list){
    if(g === 'none') put('all', '', 0, e);
    else if(g === 'tone') e.kind === 'word' ? put('w', 'Words', 99, e) : put('t' + toneOf(e), toneLabel(toneOf(e)), toneOf(e), e);
    else if(g === 'radical') e.kind === 'word' ? put('w', 'Words', '￿', e) : put('r' + (e.radical || ''), e.radical ? `Radical ${e.radical}` : 'No radical yet', e.radical || '￾', e);
    else if(g === 'hsk') e.hsk_level ? put('h' + e.hsk_level, `HSK ${e.hsk_level}`, e.hsk_level, e) : put('h0', 'Beyond HSK 2 / not set', 99, e);
    else if(g === 'date'){
      const d = new Date(e.created_at);
      const key = d.getFullYear() * 100 + d.getMonth();
      put('d' + key, d.toLocaleDateString([], { month: 'long', year: 'numeric' }), -key, e);
    }
  }
  return [...map.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    .map(sec => ({ ...sec, items: sortEntries(sec.items) }));
}

/* ==========================================================================
   Rendering — main list
   ========================================================================== */
function render(){
  if(!state.loaded) return;
  const pending = state.inbox.filter(i => i.status === 'pending');
  $('sort-btn').classList.toggle('active', state.prefs.group !== 'tone' || state.prefs.sort !== 'pinyin' || state.prefs.tones.length !== 5);
  document.querySelectorAll('#filter button').forEach(b => b.classList.toggle('on', b.dataset.f === state.filter));

  const Q = parseQuery();
  const searching = !!Q.q;
  const list = $('list');
  const out = [];

  if(state.filter === 'all' || state.filter === 'inbox'){
    const pend = pending.filter(i => inboxMatches(i, Q));
    if(pend.length || state.filter === 'inbox'){
      out.push(secHead(state.filter === 'inbox' ? 'Pending' : 'Inbox', pend.length));
      out.push(pend.length ? panel(pend.map(inboxRow)) : el('div', 'empty', searching ? 'No inbox items match.' : 'Inbox is empty. Tap ＋ to capture something for Claude.'));
    }
    if(state.filter === 'inbox'){
      const done = state.inbox.filter(i => i.status !== 'pending' && inboxMatches(i, Q));
      if(done.length){
        const h = secHead('Processed', null);
        const tg = el('button', 'toggle', `${done.length} ${state.showProcessed ? '▴' : '▾'}`);
        tg.onclick = () => { state.showProcessed = !state.showProcessed; render(); };
        h.appendChild(tg); out.push(h);
        if(state.showProcessed) out.push(panel(done.map(inboxRow)));
      }
    }
  }

  if(state.filter !== 'inbox'){
    const kinds = state.filter === 'char' ? ['character'] : state.filter === 'word' ? ['word'] : ['character', 'word'];
    const matches = state.entries.filter(e => kinds.includes(e.kind) && toneAllowed(e) && entryMatches(e, Q));
    for(const sec of groupEntries(matches)){
      if(sec.label) out.push(secHead(sec.label, sec.items.length));
      else out.push(el('div', 'sec-h'));
      out.push(panel(sec.items.map(e => entryRow(e))));
    }
    if(!matches.length){
      if(searching) out.push(el('div', 'empty', `Nothing matches “${Q.raw}”. Tap ＋ to add it to the inbox for Claude.`));
      else if(!state.entries.length) out.push(el('div', 'empty', DEMO ? 'No entries.' : 'No entries yet. If you expected your repository here, check that your account is in the tones.owners table (README, step 3).'));
      else out.push(el('div', 'empty', 'No entries with these filters. Check the tone filter in Sort and group.'));
    }
  }
  list.replaceChildren(...out);
}

function secHead(label, count){
  const h = el('div', 'sec-h');
  h.appendChild(el('span', null, label));
  if(count != null) h.appendChild(el('span', null, String(count)));
  return h;
}
function panel(children){ const p = el('div', 'panel'); p.append(...children); return p; }

function tilesFor(e){
  const wrap = el('div', 'tiles');
  [...e.hanzi].forEach((ch, i) => {
    const t = e.kind === 'word' ? (e.tones[i] || e.tones[0] || 5) : toneOf(e);
    wrap.appendChild(el('div', `tile t${t}`, ch));
  });
  return wrap;
}

function entryRow(e){
  const open = state.openId === e.id;
  const row = el('div', `row t${toneOf(e)}${open ? ' open' : ''}`);
  row.dataset.id = e.id;

  const hd = el('div', 'hd');
  hd.appendChild(tilesFor(e));
  const head = el('div', 'head');
  if(open){
    const l1 = el('div');
    l1.appendChild(el('span', 'py', e.pinyin));
    const tn = e.kind === 'word' ? e.tones.map(t => t === 5 ? 'neutral' : t).join(' + ') : (toneOf(e) === 5 ? 'neutral' : `${toneOf(e)} ${TONE_NAME[toneOf(e)]}`);
    l1.appendChild(el('span', 'tn', ` · ${tn}`));
    head.append(l1, el('span', 'mn', e.meaning));
  }else{
    head.append(el('span', 'py', e.pinyin), document.createTextNode(' '), el('span', 'mn', e.meaning));
  }
  hd.appendChild(head);
  hd.appendChild(el('span', 'chev', '▴'));
  row.appendChild(hd);

  if(!open){
    if(e.scene) row.appendChild(el('div', 'preview', e.scene));
    row.onclick = () => { state.openId = e.id; state.editId = null; render(); scrollToRow(e.id); };
    return row;
  }

  hd.style.cursor = 'pointer';
  hd.onclick = () => { if(state.editId === e.id) return; state.openId = null; render(); };

  if(state.editId === e.id){ row.appendChild(editBlock(e)); return row; }

  row.appendChild(el('div', 'story', e.scene || '—'));
  if(e.components) row.appendChild(el('div', 'meta', e.components));
  if(e.collision_guard) row.appendChild(el('div', 'meta', `Collision guard: ${e.collision_guard}`));
  if(e.notes) row.appendChild(el('div', 'meta', e.notes));

  const links = el('div', 'links');
  if(e.kind === 'character'){
    state.entries.filter(x => x.kind === 'character' && x.hanzi === e.hanzi && x.id !== e.id)
      .forEach(x => links.appendChild(linkTo(x, `Also read ${x.pinyin} ›`)));
    state.entries.filter(x => x.kind === 'word' && x.hanzi.includes(e.hanzi))
      .forEach(x => links.appendChild(linkTo(x, `${x.hanzi} ${x.pinyin} ›`)));
  }else{
    const missing = [];
    [...new Set(e.hanzi)].forEach(ch => {
      const hits = state.entries.filter(x => x.kind === 'character' && x.hanzi === ch);
      if(hits.length) hits.forEach(x => links.appendChild(linkTo(x, `${x.hanzi} ${x.pinyin} ›`)));
      else missing.push(ch);
    });
    if(missing.length){
      const m = el('span', null, `${missing.join(' · ')} not in the repository yet`);
      m.style.color = 'var(--faint)'; links.appendChild(m);
    }
  }
  if(links.childNodes.length) row.appendChild(links);

  const foot = el('div', 'foot');
  const det = [e.radical, e.hsk_level ? `HSK ${e.hsk_level}` : 'HSK beyond 2', e.status === 'needs_rebuild' ? 'Needs rebuild' : 'Locked'].filter(Boolean).join(' · ');
  foot.appendChild(el('span', 'det', det));
  const acts = el('div', 'acts');
  const bEdit = el('button', 'act', 'Edit');
  bEdit.onclick = (ev) => { ev.stopPropagation(); state.editId = e.id; render(); };
  const bRework = el('button', 'act', 'Rework');
  bRework.onclick = (ev) => { ev.stopPropagation(); openAdd(e); };
  acts.append(bEdit, el('span', 'sep', '·'), bRework);
  foot.appendChild(acts);
  row.appendChild(foot);
  return row;
}

function linkTo(target, label){
  const a = el('a', null, label);
  a.onclick = (ev) => {
    ev.stopPropagation();
    state.q = target.hanzi; $('search').value = target.hanzi; $('search-box').classList.add('has-text');
    state.filter = 'all'; state.openId = target.id; state.editId = null;
    render(); scrollToRow(target.id);
  };
  return a;
}

function editBlock(e){
  const box = el('div');
  box.appendChild(el('div', 'ed-label', 'Story'));
  const sc = el('textarea', 'ed'); sc.value = e.scene || ''; sc.rows = 5;
  box.appendChild(sc);
  box.appendChild(el('div', 'ed-label', 'Components'));
  const co = el('textarea', 'ed'); co.value = e.components || ''; co.rows = 2;
  box.appendChild(co);
  const btns = el('div', 'btn-row');
  const cancel = el('button', 'btn ghost', 'Cancel');
  cancel.onclick = (ev) => { ev.stopPropagation(); state.editId = null; render(); };
  const save = el('button', 'btn go', 'Save');
  save.onclick = async (ev) => {
    ev.stopPropagation();
    if(!sc.value.trim()){ toast('The story can’t be empty.'); sc.focus(); return; }
    save.disabled = true; save.textContent = 'Saving…';
    try{
      const upd = await api.updateEntry(e.id, { scene: sc.value.trim(), components: co.value.trim() || null });
      Object.assign(e, upd); state.editId = null; render(); toast('Saved');
    }catch(ex){ fail(ex); save.disabled = false; save.textContent = 'Save'; }
  };
  btns.append(cancel, save);
  box.appendChild(btns);
  setTimeout(() => sc.focus(), 30);
  return box;
}

function inboxRow(it){
  const open = state.openInboxId === it.id;
  const done = it.status !== 'pending';
  const row = el('div', `irow${open ? ' open' : ''}${done ? ' done' : ''}`);
  row.dataset.id = it.id;
  const body = el('div'); body.style.flex = '1'; body.style.minWidth = '0';
  const txt = el('div', 'txt');
  const ref = it.about_entry_id && state.entries.find(x => x.id === it.about_entry_id);
  if(it.about_entry_id) txt.appendChild(el('span', 'reftext', ref ? `Rework ${ref.hanzi} · ` : 'Rework · '));
  txt.appendChild(document.createTextNode(it.body));

  if(open && state.editInboxId === it.id){
    const ta = el('textarea', 'ed'); ta.value = it.body; ta.rows = 4;
    body.appendChild(ta);
    const btns = el('div', 'btn-row');
    const c = el('button', 'btn ghost', 'Cancel'); c.onclick = (ev) => { ev.stopPropagation(); state.editInboxId = null; render(); };
    const s = el('button', 'btn go', 'Save');
    s.onclick = async (ev) => {
      ev.stopPropagation();
      if(!ta.value.trim()){ toast('Write something first.'); return; }
      s.disabled = true;
      try{ const upd = await api.updateInbox(it.id, ta.value.trim()); Object.assign(it, upd); state.editInboxId = null; render(); toast('Saved'); }
      catch(ex){ fail(ex); s.disabled = false; }
    };
    btns.append(c, s); body.appendChild(btns);
    setTimeout(() => ta.focus(), 30);
  }else{
    body.appendChild(txt);
    if(done && it.result_note) body.appendChild(el('div', 'result', `→ ${it.result_note}`));
    if(open){
      const foot = el('div', 'foot');
      foot.appendChild(el('span', 'det', done ? `Processed ${when(it.processed_at || it.created_at)}` : 'Waiting for Claude'));
      if(!done){
        const acts = el('div', 'acts');
        const be = el('button', 'act', 'Edit'); be.onclick = (ev) => { ev.stopPropagation(); state.editInboxId = it.id; render(); };
        const bd = el('button', 'act danger', 'Delete');
        bd.onclick = async (ev) => {
          ev.stopPropagation();
          if(!confirm('Delete this inbox item?')) return;
          try{ await api.deleteInbox(it.id); state.inbox = state.inbox.filter(x => x.id !== it.id); state.openInboxId = null; render(); toast('Deleted'); }
          catch(ex){ fail(ex); }
        };
        acts.append(be, el('span', 'sep', '·'), bd); foot.appendChild(acts);
      }
      body.appendChild(foot);
    }
  }
  row.appendChild(body);
  row.appendChild(el('span', 'tm', when(it.created_at)));
  row.onclick = () => {
    if(state.editInboxId === it.id) return;
    state.openInboxId = open ? null : it.id; state.editInboxId = null; render();
  };
  return row;
}

function scrollToRow(id){
  requestAnimationFrame(() => {
    const r = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if(!r) return;
    const top = document.querySelector('#view-main .top').getBoundingClientRect().height;
    const rect = r.getBoundingClientRect();
    if(rect.top < top + 8 || rect.bottom > window.innerHeight) window.scrollBy({ top: rect.top - top - 10, behavior: 'smooth' });
  });
}

/* ==========================================================================
   Sheets
   ========================================================================== */
let openSheetId = null;
function openSheet(id){
  closeSheet();
  openSheetId = id; $('scrim').classList.add('on'); $(id).classList.add('on');
}
function closeSheet(){
  if(!openSheetId) return;
  $(openSheetId).classList.remove('on'); $('scrim').classList.remove('on'); openSheetId = null;
}

function openAdd(refEntry){
  state.addRef = refEntry || null;
  $('add-title').textContent = refEntry ? `Rework ${refEntry.hanzi}` : 'Add to inbox';
  const ref = $('add-ref');
  if(refEntry){
    ref.replaceChildren(el('span', `reftag t${toneOf(refEntry)}`, `${refEntry.hanzi} ${refEntry.pinyin} · linked`));
    ref.style.display = '';
    $('add-text').placeholder = 'What should change? Paste Claude’s new version or describe it.';
    $('add-hint').textContent = 'Goes to the inbox. Claude replaces the entry when it processes it.';
    $('add-save').textContent = 'Send to inbox';
  }else{
    ref.style.display = 'none';
    $('add-text').placeholder = 'Paste from Claude or type…';
    $('add-hint').textContent = 'Free text or paste from Claude. No format needed.';
    $('add-save').textContent = 'Add';
  }
  $('add-text').value = '';
  openSheet('sheet-add');
  setTimeout(() => $('add-text').focus(), 220);
}
async function saveAdd(){
  const body = $('add-text').value.trim();
  if(!body){ toast('Write something first.'); $('add-text').focus(); return; }
  const btn = $('add-save'); btn.disabled = true;
  try{
    const it = await api.addInbox(body, state.addRef ? state.addRef.id : null);
    state.inbox.unshift(it); closeSheet(); render();
    toast(state.addRef ? 'Sent to inbox for Claude' : 'Added to inbox');
  }catch(ex){ fail(ex); }
  finally{ btn.disabled = false; }
}

function renderSortSheet(){
  const mk = (wrapId, items, cur, onPick) => {
    const w = $(wrapId); w.replaceChildren();
    items.forEach(([k, label]) => {
      const b = el('button', `pill${k === cur ? ' on' : ''}`, label);
      b.onclick = () => { onPick(k); savePrefs(); renderSortSheet(); render(); };
      w.appendChild(b);
    });
  };
  mk('group-pills', GROUPS, state.prefs.group, (k) => state.prefs.group = k);
  mk('sortby-pills', SORTS, state.prefs.sort, (k) => state.prefs.sort = k);
  const tw = $('tone-pills'); tw.replaceChildren();
  [1, 2, 3, 4, 5].forEach(t => {
    const on = state.prefs.tones.includes(t);
    const b = el('button', `pill tone t${t}${on ? '' : ' off'}`, t === 5 ? 'neutral' : String(t));
    b.onclick = () => {
      const s = new Set(state.prefs.tones);
      if(on && s.size > 1) s.delete(t); else s.add(t);
      state.prefs.tones = [...s].sort(); savePrefs(); renderSortSheet(); render();
    };
    tw.appendChild(b);
  });
}
function savePrefs(){ lsSet('ta-prefs', state.prefs); }

async function openMenu(){
  $('stats').textContent = '…'; $('changes-today').textContent = '';
  openSheet('sheet-menu');
  try{
    const s = await api.stats();
    $('stats').textContent = `${s.characters} characters · ${s.readings} readings · ${s.words} words` + (s.needs_rebuild ? ` · ${s.needs_rebuild} to rebuild` : '');
    const h = await api.history(100);
    const today = h.filter(x => dayLabel(x.changed_at) === 'Today').length;
    $('changes-today').textContent = today ? `${today} today` : '';
  }catch(ex){ $('stats').textContent = 'Counts unavailable'; console.error(ex); }
}

async function exportJson(){
  try{
    const [entries, inbox] = await Promise.all([api.entries(), api.inbox()]);
    const data = { exported_at: new Date().toISOString(), entries, inbox };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob);
    a.download = `tone-anchoring-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Exported ${entries.length} entries and ${inbox.length} inbox items`);
  }catch(ex){ fail(ex); }
}

/* ==========================================================================
   Changes page
   ========================================================================== */
const FIELD_LABEL = { scene: 'Story', components: 'Components', meaning: 'Meaning', pinyin: 'Pinyin', tones: 'Tones', hanzi: 'Hanzi', radical: 'Radical', hsk_level: 'HSK', status: 'Status', tags: 'Tags', notes: 'Notes', collision_guard: 'Collision guard', kind: 'Type', body: 'Text', result_note: 'Result' };
function changedFields(h){
  if(!h.before || !h.after) return [];
  return Object.keys(FIELD_LABEL).filter(k => JSON.stringify(h.before[k] ?? null) !== JSON.stringify(h.after[k] ?? null));
}
function describe(h){
  const r = h.after || h.before || {};
  if(h.table_name === 'entries'){
    const name = `${r.hanzi || ''}`;
    if(h.action === 'insert') return [`Added ${name}`, r.pinyin || ''];
    if(h.action === 'delete') return [`Deleted ${name}`, r.pinyin || ''];
    return [`Updated ${name}`, changedFields(h).map(k => FIELD_LABEL[k].toLowerCase()).join(', ')];
  }
  if(h.action === 'insert') return ['Added to inbox', snippet(r.body, 50)];
  if(h.action === 'delete') return ['Deleted inbox item', snippet(r.body, 50)];
  if(h.before && h.after && h.before.status !== h.after.status && h.after.status === 'processed') return ['Processed inbox item', h.after.result_note || snippet(r.body, 50)];
  return ['Edited inbox item', snippet(r.body, 50)];
}

async function showChanges(){
  showView('changes'); window.scrollTo(0, 0);
  const box = $('changes-list'); box.replaceChildren(el('div', 'loading', 'Loading…'));
  try{
    const hist = await api.history(150);
    if(!hist.length){ box.replaceChildren(el('div', 'empty', 'No changes yet.')); return; }
    const out = []; let cur = null, pnl = null;
    for(const h of hist){
      const lab = dayLabel(h.changed_at);
      if(lab !== cur){ cur = lab; out.push(secHead(lab, null)); pnl = el('div', 'panel'); out.push(pnl); }
      pnl.appendChild(changeRow(h));
    }
    box.replaceChildren(...out);
  }catch(ex){ box.replaceChildren(el('div', 'empty', `Couldn't load changes. ${ex.message || ''}`)); }
}
function changeRow(h){
  const row = el('div', 'crow');
  const l1 = el('div', 'l1');
  l1.appendChild(el('span', `src ${h.source === 'app' ? 'app' : 'claude'}`, h.source === 'app' ? 'You' : 'Claude'));
  const [what, sub] = describe(h);
  const w = el('div', 'what'); w.appendChild(el('div', null, what));
  w.appendChild(el('div', 'sub', [sub, when(h.changed_at)].filter(Boolean).join(' · ')));
  l1.appendChild(w);
  if(h.table_name === 'entries'){
    const u = el('button', 'act', 'Undo');
    u.onclick = async (ev) => {
      ev.stopPropagation();
      const msg = h.action === 'insert' ? `Undo: remove ${h.after.hanzi} again?` : `Undo: put ${(h.before || {}).hanzi} back the way it was before this change?`;
      if(!confirm(msg)) return;
      try{ await api.undo(h.id); toast('Undone'); await loadAll(); showChanges(); }catch(ex){ fail(ex); }
    };
    l1.appendChild(u);
  }
  row.appendChild(l1);
  const fields = changedFields(h);
  if(h.action === 'update' && fields.length){
    row.style.cursor = 'pointer';
    const diff = el('div', 'diff'); diff.style.display = state.openChangeId === h.id ? '' : 'none';
    fields.forEach(k => {
      diff.appendChild(el('div', 'f', FIELD_LABEL[k]));
      const fmt = (v) => v == null || v === '' ? '(empty)' : Array.isArray(v) ? v.join(', ') : String(v);
      diff.appendChild(el('div', 'was', fmt(h.before[k])));
      diff.appendChild(el('div', 'now', fmt(h.after[k])));
    });
    row.appendChild(diff);
    row.onclick = () => { const on = diff.style.display === 'none'; diff.style.display = on ? '' : 'none'; state.openChangeId = on ? h.id : null; };
  }
  return row;
}

/* ==========================================================================
   Views, auth, wiring
   ========================================================================== */
function showView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
}

function wire(){
  const s = $('search');
  let t = null;
  s.addEventListener('input', () => {
    $('search-box').classList.toggle('has-text', !!s.value);
    clearTimeout(t); t = setTimeout(() => { state.q = s.value; state.openId = null; state.editId = null; render(); }, 80);
  });
  $('search-clear').onclick = () => { s.value = ''; state.q = ''; state.openId = null; $('search-box').classList.remove('has-text'); render(); s.focus(); };
  document.querySelectorAll('#filter button').forEach(b => b.onclick = () => { state.filter = b.dataset.f; state.openId = null; state.openInboxId = null; render(); window.scrollTo(0, 0); });
  $('add-btn').onclick = () => openAdd(null);
  $('add-save').onclick = saveAdd;
  $('sort-btn').onclick = () => { renderSortSheet(); openSheet('sheet-sort'); };
  $('menu-btn').onclick = openMenu;
  $('scrim').onclick = closeSheet;
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeSheet(); });
  $('m-changes').onclick = () => { closeSheet(); showChanges(); };
  $('m-export').onclick = () => { closeSheet(); exportJson(); };
  $('m-signout').onclick = async () => { closeSheet(); if(DEMO){ toast('Demo mode: nothing to sign out of'); return; } await api.supa.auth.signOut(); };
  $('changes-back').onclick = () => { showView('main'); render(); };
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && state.loaded && Date.now() - state.lastLoad > 30000 && !state.editId && !state.editInboxId) loadAll();
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('login-error'); err.textContent = '';
    const btn = $('login-submit'); btn.disabled = true; btn.textContent = 'Signing in…';
    try{
      const { error } = await api.supa.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value });
      if(error) throw error;
    }catch(ex){ err.textContent = ex.message || 'Sign-in failed.'; }
    finally{ btn.disabled = false; btn.textContent = 'Sign in'; }
  });
}

function onSignedIn(session){
  if(currentUserId === session.user.id && state.loaded) return;
  currentUserId = session.user.id;
  showView('main'); loadAll();
}
function onSignedOut(){
  currentUserId = null; state.entries = []; state.inbox = []; state.loaded = false;
  $('login-password').value = ''; showView('login');
}

async function init(){
  state.prefs = { ...state.prefs, ...lsGet('ta-prefs', {}) };
  if(!Array.isArray(state.prefs.tones) || !state.prefs.tones.length) state.prefs.tones = [1, 2, 3, 4, 5];
  wire();
  if(DEMO){
    $('demo-banner').style.display = '';
    api = demoApi(); showView('main'); loadAll(); return;
  }
  api = supabaseApi();
  api.supa.auth.onAuthStateChange((_ev, session) => { if(session && session.user) onSignedIn(session); else onSignedOut(); });
  const { data } = await api.supa.auth.getSession();
  if(data && data.session) onSignedIn(data.session); else showView('login');
}
init();
