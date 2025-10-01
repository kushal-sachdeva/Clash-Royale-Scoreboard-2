import {
  auth, db, onAuthStateChanged, signOut, serverTimestamp,
  doc, setDoc, getDoc, collection, addDoc, getDocs, query, where,
  orderBy, onSnapshot, updateDoc, runTransaction, deleteDoc
} from './firebase.js';

const SCORE_COOLDOWN_MS = 120000;
the ARM_WINDOW_MS = 600000;

const $ = (q)=>document.querySelector(q);
const $$ = (q)=>document.querySelectorAll(q);
const toast = (msg, title='')=>{
  const el = $('#toast'), bg = $('#toastBackdrop');
  el.innerHTML = title ? `<span class="toast-title">${title}</span>${msg}` : msg;
  bg.classList.add('show'); el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ el.classList.remove('show'); bg.classList.remove('show'); }, 3000);
};
const human = (ms)=>{ const s = Math.ceil(ms/1000); const m = Math.floor(s/60); const r = s%60; return m ? `${m}m ${r}s` : `${r}s`; };
const remainingScore = (d)=>{ const last = d.lastUpdate ? d.lastUpdate.toMillis() : 0; return Math.max(0, SCORE_COOLDOWN_MS - (Date.now() - last)); };
const remainingArm = (ts)=>{ const t = ts ? (ts.toMillis ? ts.toMillis() : ts) : 0; return Math.max(0, ARM_WINDOW_MS - (Date.now() - t)); };
const badge = (cls, text)=> `<span class="badge ${cls}">${text}</span>`;

let currentUser = null;
let currentGroup = null;
let modes = [];
let members = [];
let unsubMatchups = null;
let snapshotDocs = [];

onAuthStateChanged(auth, async (u)=>{
  if (!u) { location.href='login.html'; return; }
  currentUser = u;
  if ($('#avatar')) $('#avatar').src = u.photoURL || '';
  await ensureUserDoc(u);
  await loadGroups();
});

async function ensureUserDoc(u){
  const ref = doc(db,'users',u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref,{ displayName:u.displayName||'', email:u.email||'', photoURL:u.photoURL||'', createdAt:serverTimestamp() });
}

async function loadGroups(){
  const sel = $('#groupSelect');
  sel.innerHTML = '';
  const qs = query(collection(db,'groups'), where(`members.${currentUser.uid}`, 'in', ['owner','editor','viewer']));
  const col = await getDocs(qs);
  const items = [];
  col.forEach(d=>{
    const x = d.data();
    const role = x.members?.[currentUser.uid] || '';
    items.push({ id:d.id, name:x.name, role, modes:x.modes||[] });
  });
  if (!items.length) { openGroupModal(); return; }
  items.forEach(g=>{
    const o = document.createElement('option');
    o.value = g.id; o.textContent = `${g.name} (${g.role})`;
    sel.appendChild(o);
  });
  sel.onchange = ()=> setGroup(sel.value);
  await setGroup(items[0].id);
}

async function setGroup(gid){
  currentGroup = gid;
  const g = await getDoc(doc(db,'groups',gid));
  const data = g.data()||{};
  modes = data.modes||["7x","Triple Draft","Mega Draft"];
  await loadMembers();
  populateSelectors();
  listenMatchups();
}

async function loadMembers(){
  members = [];
  const g = await getDoc(doc(db,'groups',currentGroup));
  const m = g.data()?.members||{};
  const uids = Object.keys(m);
  for (const uid of uids){
    const us = await getDoc(doc(db,'users',uid));
    const u = us.data()||{};
    members.push({ uid, name: u.displayName||u.email||uid, role: m[uid] });
  }
}

function populateSelectors(){
  const modeSel = $('#mode');
  modeSel.innerHTML = '';
  modes.forEach(x=>{ const o=document.createElement('option'); o.value=x; o.textContent=x; modeSel.appendChild(o); });

  const aSel = $('#playerA'), bSel = $('#playerB');
  [aSel,bSel].forEach(s=> s.innerHTML='');
  members.forEach(m=>{
    const o1=document.createElement('option'); o1.value=m.uid; o1.textContent=m.name; aSel.appendChild(o1);
    const o2=document.createElement('option'); o2.value=m.uid; o2.textContent=m.name; bSel.appendChild(o2);
  });
}

function cardHTML(it){
  const sRem = remainingScore(it);
  const sReady = sRem===0;
  const hasScored = !!it.lastUpdate;
  const rRem = remainingArm(it.resetArmAt);
  const rArmed = !!it.resetArmAt;
  const rLabel = !rArmed ? 'Reset: Tap to arm' : (rRem===0 ? 'Reset: Ready to confirm' : `Reset: Armed — Wait ${human(rRem)}`);
  const dRem = remainingArm(it.deleteArmAt);
  const dArmed = !!it.deleteArmAt;
  const dLabel = !dArmed ? 'Delete: Tap to arm' : (dRem===0 ? 'Delete: Ready to confirm' : `Delete: Armed — Wait ${human(dRem)}`);
  return `
  <div class="card" data-id="${it.id}">
    <div class="row">
      <div>
        <div class="vs"><span class="name">${it.aName}</span> vs <span class="name">${it.bName}</span></div>
        <div class="subtitle">${it.mode}</div>
      </div>
      <div class="toolbar">
        ${sReady ? badge('ok','Score: Ready') : badge('wait',`Score: Wait ${human(sRem)}`)}
        ${!rArmed ? badge('',rLabel) : (rRem===0 ? badge('ok',rLabel) : badge('wait',rLabel))}
        ${!dArmed ? badge('',dLabel) : (dRem===0 ? badge('ok',dLabel) : badge('wait',dLabel))}
      </div>
    </div>
    <div class="row">
      <div class="score">${it.sa} : ${it.sb}</div>
      <div class="controls">
        ${(!sReady && hasScored) ? `<div class="cooldown-overlay" data-id="${it.id}"></div>` : ``}
        <button class="button ${sReady?'':'dim'}" ${sReady?'':'disabled'} data-action="plusA">+1 ${it.aName}</button>
        <button class="button ${sReady?'':'dim'}" ${sReady?'':'disabled'} data-action="plusB">+1 ${it.bName}</button>
      </div>
    </div>
    <div class="row">
      <div class="small">Last score add: ${it.lastUpdate ? it.lastUpdate.toDate().toLocaleString() : '—'}</div>
      <div class="controls">
        <button class="button secondary" data-action="reset">Reset</button>
        <button class="button secondary" data-action="delete">Delete</button>
      </div>
    </div>
  </div>`;
}

function render(docs){
  snapshotDocs = docs;
  const q = $('#search').value.trim().toLowerCase();
  const items = docs.filter(x=> !q || x.aName.toLowerCase().includes(q) || x.bName.toLowerCase().includes(q) || (x.mode||'').toLowerCase().includes(q)).sort((x,y)=> (y.createdMs||0)-(x.createdMs||0));
  $('#list').innerHTML = items.map(cardHTML).join('');
  $('#empty').style.display = items.length ? 'none' : 'block';
}

function updateBadges(){
  const map = new Map(snapshotDocs.map(x=>[x.id, x]));
  $$('#list .card').forEach(card=>{
    const id = card.dataset.id;
    const it = map.get(id); if (!it) return;
    const sRem = remainingScore(it), sReady = sRem===0, hasScored = !!it.lastUpdate;
    const badges = card.querySelectorAll('.toolbar .badge');
    if (badges[0]) badges[0].outerHTML = sReady ? '<span class="badge ok">Score: Ready</span>' : `<span class="badge wait">Score: Wait ${human(sRem)}</span>`;
    const btnA = card.querySelector('[data-action="plusA"]');
    const btnB = card.querySelector('[data-action="plusB"]');
    if (btnA && btnB) {
      btnA.classList.toggle('dim', !sReady); btnB.classList.toggle('dim', !sReady);
      btnA.toggleAttribute('disabled', !sReady); btnB.toggleAttribute('disabled', !sReady);
    }
    const controls = card.querySelector('.controls');
    let ov = controls.querySelector('.cooldown-overlay');
    if (!sReady && hasScored) { if (!ov) { ov=document.createElement('div'); ov.className='cooldown-overlay'; ov.dataset.id=id; controls.prepend(ov); } } else if (ov) ov.remove();

    const rRem = remainingArm(it.resetArmAt), rArmed = !!it.resetArmAt;
    const rHTML = !rArmed ? '<span class="badge">Reset: Tap to arm</span>' : (rRem===0 ? '<span class="badge ok">Reset: Ready to confirm</span>' : `<span class="badge wait">Reset: Armed — Wait ${human(rRem)}</span>`);
    if (badges[1]) badges[1].outerHTML = rHTML;

    const dRem = remainingArm(it.deleteArmAt), dArmed = !!it.deleteArmAt;
    const dHTML = !dArmed ? '<span class="badge">Delete: Tap to arm</span>' : (dRem===0 ? '<span class="badge ok">Delete: Ready to confirm</span>' : `<span class="badge wait">Delete: Armed — Wait ${human(dRem)}</span>`);
    if (badges[2]) badges[2].outerHTML = dHTML;
  });
}

function listenMatchups(){
  if (unsubMatchups) unsubMatchups();
  const qy = query(collection(db,'matchups'), where('groupId','==',currentGroup), orderBy('created','desc'));
  unsubMatchups = onSnapshot(qy, (snap)=>{
    const docs = [];
    snap.forEach(d=>{
      const x = d.data();
      docs.push({
        id: d.id,
        aUid: x.aUid, bUid: x.bUid, aName: x.aName, bName: x.bName,
        mode: x.mode, sa: x.sa, sb: x.sb,
        created: x.created || null, createdMs: x.created ? x.created.toMillis() : 0,
        lastUpdate: x.lastUpdate || null, resetArmAt: x.resetArmAt || null, deleteArmAt: x.deleteArmAt || null
      });
    });
    render(docs);
  });
}

async function addMatchup(){
  const mode = $('#mode').value;
  const aUid = $('#playerA').value;
  const bUid = $('#playerB').value;
  if (!aUid || !bUid || aUid===bUid) return toast('Pick two different players');
  const aName = members.find(m=>m.uid===aUid)?.name || 'Player A';
  const bName = members.find(m=>m.uid===bUid)?.name || 'Player B';
  await addDoc(collection(db,'matchups'),{
    groupId: currentGroup, mode, aUid, bUid, aName, bName,
    sa:0, sb:0, created: serverTimestamp(), createdBy: currentUser.uid
  });
}

async function bump(id, side){
  const ref = doc(db,'matchups',id);
  await runTransaction(db, async (tx)=>{
    const s = await tx.get(ref); if (!s.exists()) throw new Error('missing');
    const d = s.data();
    const last = d.lastUpdate ? d.lastUpdate.toMillis() : 0;
    if (Date.now() - last < SCORE_COOLDOWN_MS) throw new Error('cooldown');
    tx.update(ref, { sa: d.sa + (side==='a'?1:0), sb: d.sb + (side==='b'?1:0), lastUpdate: serverTimestamp() });
  }).then(()=> toast('Score added')).catch(err=>{
    if (String(err).includes('cooldown')) {
      getDoc(ref).then(s=>{
        const d=s.data(); const rem=Math.max(0, SCORE_COOLDOWN_MS - (Date.now() - (d.lastUpdate?d.lastUpdate.toMillis():0)));
        toast(`Cooldown — ${human(rem)} left (anti-tampering)`, d.mode||'');
      });
    } else toast('Failed');
  });
}

async function onReset(id){
  const ref = doc(db,'matchups',id);
  const snap = await getDoc(ref); if (!snap.exists()) return;
  const d = snap.data();
  const armed = !!d.resetArmAt; const rem = remainingArm(d.resetArmAt);
  if (!armed) { await updateDoc(ref,{ resetArmAt: serverTimestamp() }); return toast('Reset armed — come back in 10 minutes, then tap Reset again to confirm.', d.mode||''); }
  if (rem > 0) return toast(`Reset armed — ${human(rem)} left before you can confirm.`, d.mode||'');
  await updateDoc(ref,{ sa:0, sb:0, lastUpdate:null, resetArmAt:null }); toast('Reset complete', d.mode||'');
}

async function onDelete(id){
  const ref = doc(db,'matchups',id);
  const snap = await getDoc(ref); if (!snap.exists()) return;
  const d = snap.data();
  const armed = !!d.deleteArmAt; const rem = remainingArm(d.deleteArmAt);
  if (!armed) { await updateDoc(ref,{ deleteArmAt: serverTimestamp() }); return toast('Delete armed — come back in 10 minutes, then tap Delete again to confirm.', d.mode||''); }
  if (rem > 0) return toast(`Delete armed — ${human(rem)} left before you can confirm.`, d.mode||'');
  await deleteDoc(ref); toast('Matchup deleted', d.mode||'');
}

document.addEventListener('click', async (e)=>{
  const ov = e.target.closest('.cooldown-overlay');
  if (ov) {
    const id = ov.getAttribute('data-id');
    const it = snapshotDocs.find(x=>x.id===id);
    if (it) { const rem = remainingScore(it); if (rem>0) toast(`Cooldown — ${human(rem)} left (anti-tampering)`, it.mode||''); }
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const card = btn.closest('.card'); const id = card?.dataset.id;
  if (btn.dataset.action==='plusA') return bump(id,'a');
  if (btn.dataset.action==='plusB') return bump(id,'b');
  if (btn.dataset.action==='reset') return onReset(id);
  if (btn.dataset.action==='delete') return onDelete(id);
});

$('#add').addEventListener('click', addMatchup);
$('#search').addEventListener('input', ()=> render(snapshotDocs));
setInterval(updateBadges, 1000);

$('#logout').addEventListener('click', ()=> signOut(auth).then(()=> location.href='login.html'));

$('#newGroup').addEventListener('click', openGroupModal);
$('#manageMembers').addEventListener('click', openMembersModal);

function openGroupModal(){ $('#groupModal').classList.add('show'); }
function closeGroupModal(){ $('#groupModal').classList.remove('show'); }
function openMembersModal(){ $('#membersModal').classList.add('show'); refreshMembersUI(); }
function closeMembersModal(){ $('#membersModal').classList.remove('show'); }

$('#cancelGroup').addEventListener('click', closeGroupModal);
$('#createGroup').addEventListener('click', async ()=>{
  const name = $('#groupName').value.trim();
  const ms = $('#groupModes').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!name) return;
  const gref = await addDoc(collection(db,'groups'),{
    name, ownerUid: currentUser.uid,
    modes: ms.length?ms:["7x","Triple Draft","Mega Draft"],
    createdAt: serverTimestamp(),
    members: { [currentUser.uid]:"owner" }
  });
  await setGroup(gref.id);
  await loadGroups();
  closeGroupModal();
  toast('Group created');
});

$('#closeMembers').addEventListener('click', closeMembersModal);
$('#inviteBtn').addEventListener('click', async ()=>{
  const email = $('#inviteEmail').value.trim();
  const role = $('#inviteRole').value;
  if (!email) return;
  const snap = await getDocs(query(collection(db,'users'), where('email','==',email)));
  if (snap.empty) { toast('No user found'); return; }
  const udoc = snap.docs[0];
  const gid = currentGroup;
  const g = await getDoc(doc(db,'groups',gid));
  const data = g.data()||{};
  const members = data.members||{};
  members[udoc.id] = role;
  await updateDoc(doc(db,'groups',gid),{ members });
  await setGroup(gid);
  $('#inviteEmail').value='';
  toast('Member added');
});

async function refreshMembersUI(){
  const box = $('#membersList');
  box.innerHTML = '';
  const g = await getDoc(doc(db,'groups',currentGroup));
  const data = g.data()||{};
  const entries = Object.entries(data.members||{});
  for (const [uid, role] of entries){
    const us = await getDoc(doc(db,'users',uid));
    const u = us.data()||{};
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div>${u.displayName||u.email||uid} <span class="small">(${role})</span></div>
      <div class="controls">
        <select data-uid="${uid}" class="input roleSel">
          <option value="owner"${role==='owner'?' selected':''}>owner</option>
          <option value="editor"${role==='editor'?' selected':''}>editor</option>
          <option value="viewer"${role==='viewer'?' selected':''}>viewer</option>
        </select>
        <button class="button secondary removeBtn" data-uid="${uid}">Remove</button>
      </div>`;
    box.appendChild(row);
  }
  box.querySelectorAll('.roleSel').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const uid = sel.getAttribute('data-uid');
      const g = await getDoc(doc(db,'groups',currentGroup));
      const members = g.data()?.members||{};
      members[uid] = sel.value;
      await updateDoc(doc(db,'groups',currentGroup),{ members });
      toast('Role updated');
    });
  });
  box.querySelectorAll('.removeBtn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const uid = btn.getAttribute('data-uid');
      const g = await getDoc(doc(db,'groups',currentGroup));
      const members = g.data()?.members||{};
      delete members[uid];
      await updateDoc(doc(db,'groups',currentGroup),{ members });
      await setGroup(currentGroup);
      toast('Member removed');
    });
  });
}
