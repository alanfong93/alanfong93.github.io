import { CATALOG, ARCADE, MANAGED_KINDS, validateServiceSettings, getAllocation, serviceSnapshot, configureService, failServiceReplica, validateEdge, analyzeTopology, createRun, applyTopology, rebootNode, stepRun, summarizeRun, starterTopology } from './engine.js';
import { CATALOG_GROUPS, buildAssessments, connectionClick, activeSituations, describeSituation, musicMood } from './interaction.js';
import { SoundEffects } from './sound.js';
import { phoneLayout, beginTap, moveTap, isTap, serviceHealth } from './phone.js';

const $ = id => document.getElementById(id);
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = n => Math.round(n).toLocaleString();
const percent = n => (n * 100).toFixed(1);
let { nodes, edges } = starterTopology('basic');
let run = null, selected = null, selectedEdge = null, wireFrom = null, placing = null, sequence = 10, speed = 1;
let drag = null, toastTimer, lastFrame = 0, lastPaint = 0, finishedShown = false;
const board = $('board');
const editable = () => true;
const activeRound = () => run && ['running', 'paused'].includes(run.status);
const scenario = () => ARCADE;
const allocated = () => getAllocation(nodes, run?.services);
const packets = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let inspectorKey = '', inspectorStamp = '';
const sound = new SoundEffects();
let soundRun = null, soundedEvents = new Set(), recoveryCursor = 0, serviceCursor = 0;

function managedInfo(node) {
  if (!node || !MANAGED_KINDS.includes(node.kind)) return null;
  if (run?.services[node.id]) return serviceSnapshot(run, node.id);
  const config = validateServiceSettings(node.kind, node.settings).settings;
  return { desired: config.replicas, ready: config.replicas, starting: 0, replacing: 0, maintenance: 0, capacity: config.replicas * CATALOG[node.kind].capacity, config, allocation: config.replicas * CATALOG[node.kind].cost, blockedReason: '', status: 'configured', metric: null };
}
function catalogAvailability() {
  const credits = allocated();
  document.querySelectorAll('.service-card').forEach(button => { button.classList.toggle('placing', button.dataset.kind === placing); button.disabled = credits + CATALOG[button.dataset.kind].cost > scenario().budget; });
}
let phoneState = { phone: false, blocked: false }, desktopLayout = false, catalogTouch = null, boardGesture = null;
const touchCards = new WeakMap(), sheetSlots = new Map();
const coarsePointer = matchMedia('(any-pointer: coarse)');
let restoreResults = false;

function cancelDrag() {
  const action = drag; drag = null;
  action?.ghost?.remove();
  if (action?.type === 'node' && action.origin) {
    const n = nodes.find(n => n.id === action.id);
    if (n) Object.assign(n, action.origin);
    renderNodes(); renderEdges();
  }
  try { if (action?.element?.hasPointerCapture(action.pointerId)) action.element.releasePointerCapture(action.pointerId); } catch { /* Capture may already be gone. */ }
}
function pauseRound() {
  cancelDrag();
  if (run?.status === 'running') run.status = 'paused';
  sound.silence(); lastFrame = performance.now(); render(); renderSoundControl();
}
function restoreSheet(dialog) {
  for (const { node, marker } of sheetSlots.get(dialog) ?? []) { marker.replaceWith(node); }
  sheetSlots.delete(dialog);
}
function closePhoneSheets() {
  for (const id of ['phone-details-dialog', 'phone-menu-dialog']) {
    const dialog = $(id); if (dialog.open) dialog.close(); restoreSheet(dialog);
  }
}
function showPhoneSheet(id, contentId, elements) {
  if ((!phoneState.phone && !desktopLayout) || phoneState.blocked) return;
  closePhoneSheets(); pauseRound();
  const dialog = $(id), slots = [];
  for (const node of elements) {
    const marker = document.createComment('phone sheet home'); node.before(marker);
    slots.push({ node, marker }); $(contentId).append(node);
  }
  sheetSlots.set(dialog, slots); dialog.showModal();
}
function updatePhoneLayout() {
  const next = phoneLayout({ coarse: coarsePointer.matches, width: innerWidth, height: innerHeight, screenWidth: screen.width, screenHeight: screen.height });
  const wasBlocked = phoneState.blocked, wasPhone = phoneState.phone;
  const wasDesktop = desktopLayout;
  desktopLayout = !next.phone && innerWidth >= 760 && innerHeight >= 420;
  phoneState = next;
  const vv = window.visualViewport;
  for (const [key, value] of Object.entries({ width: vv?.width || innerWidth, height: vv?.height || innerHeight, top: vv?.offsetTop || 0, left: vv?.offsetLeft || 0 })) document.documentElement.style.setProperty(`--phone-${key}`, `${value}px`);
  document.body.classList.toggle('phone-layout', next.phone);
  document.body.classList.toggle('desktop-layout', desktopLayout);
  document.body.classList.toggle('phone-portrait', next.blocked);
  $('game-shell').inert = next.blocked;
  $('rotate-overlay').hidden = !next.blocked;
  if (next.blocked && !wasBlocked) {
    if (catalogTouch) catalogTouch.gesture.cancelled = true;
    catalogTouch = null; if (boardGesture) boardGesture.cancelled = true;
    wireFrom = null; placing = null;
    restoreResults ||= $('results-dialog').open;
    closePhoneSheets();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    pauseRound();
    $('rotate-overlay').focus({ preventScroll: true });
  } else if (next.phone !== wasPhone || desktopLayout !== wasDesktop) closePhoneSheets();
  $('rotate-status').textContent = run?.status === 'finished' ? 'Round complete. Rotate to landscape to view your results.' : run ? 'Your round is paused. Rotate to landscape, then press Resume.' : 'Turn to landscape to build and play.';
  if (!next.blocked && wasBlocked) {
    lastFrame = performance.now();
    if (restoreResults && run?.status === 'finished') $('results-dialog').showModal();
    else (next.phone || desktopLayout ? $('phone-start') : $('start')).focus({ preventScroll: true });
    restoreResults = false;
  }
  if (next.phone || desktopLayout) window.scrollTo(0, 0);
  renderPhoneControls();
}
function renderPhoneControls() {
  $('phone-start').textContent = run?.status === 'running' ? 'Pause' : run?.status === 'paused' ? 'Resume' : run?.status === 'finished' ? 'Again' : 'Run';
  $('phone-speed').textContent = `${speed}×`;
  $('phone-clock').textContent = $('clock').textContent;
  $('phone-credits').textContent = `$${scenario().budget - allocated()}`;
  $('phone-uptime').textContent = $('uptime').textContent;
  $('phone-mute').textContent = sound.enabled ? '♪ On' : '♪ Off';
  $('phone-mute').setAttribute('aria-label', sound.enabled ? 'Mute game audio' : 'Unmute game audio');
  $('phone-mute').setAttribute('aria-pressed', String(sound.enabled));
  const n = nodes.find(n => n.id === selected);
  $('phone-selection').textContent = selectedEdge ? selectedEdge.replace(':', ' → ') : n ? `${CATALOG[n.kind]?.short ?? 'Internet'} · ${$('node-state')?.textContent ?? 'selected'}` : placing ? `Tap board: ${CATALOG[placing].short}` : 'Tap A, then B to connect · drag to move';
  const primaryAction = $('fail-replica') ?? $('reboot-node');
  $('phone-reboot').disabled = phoneState.blocked || !primaryAction || primaryAction.disabled;
  $('phone-reboot').textContent = $('fail-replica') ? 'Test failure' : n && CATALOG[n.kind]?.overloadMode === 'shutdown' ? `Reboot ${CATALOG[n.kind].rebootS}s` : 'Reboot';
  $('phone-delete').disabled = phoneState.blocked || !($('remove-edge') || $('remove-node'));
  $('phone-delete').textContent = selectedEdge ? 'Unwire' : 'Delete';
  $('selection-details').disabled = phoneState.blocked || (!n && !selectedEdge);
  $('selection-details').textContent = n && MANAGED_KINDS.includes(n.kind) ? 'Configure' : 'Details';
  $('phone-situation-copy').textContent = `${$('event-name').textContent}. ${$('event-copy').textContent}`;
  $('phone-round-summary').textContent = `Request success ${$('success').textContent} · Failed ${$('failed').textContent} · Pending ${$('pending').textContent} · Incoming ${$('rps').textContent} · ${$('downtime').textContent}`;
}

function renderSoundControl() {
  $('sound-toggle').textContent = sound.available ? sound.enabled ? '♪ Sound on' : '♪ Muted' : 'Sound unavailable';
  $('sound-toggle').setAttribute('aria-pressed', String(sound.enabled && sound.available));
  $('sound-toggle').setAttribute('aria-label', sound.enabled ? 'Mute sound effects' : 'Unmute sound effects');
  $('sound-toggle').disabled = !sound.available;
  const label = sound.musicEnabled ? '♫ Music on' : '♫ Music off';
  if ($('music-toggle').textContent !== label) $('music-toggle').textContent = label;
  $('music-toggle').setAttribute('aria-pressed', String(sound.musicEnabled));
  $('music-toggle').disabled = !sound.available;
  const volume = String(Math.round(sound.volume * 100));
  if ($('audio-volume').value !== volume) $('audio-volume').value = volume;
  $('volume-value').textContent = `${volume}%`;
  $('music-status').textContent = sound.musicStatus();
  renderPhoneControls();
}
document.addEventListener('pointerdown', () => { if (!phoneState.blocked) { sound.unlock(); renderSoundControl(); } }, { capture: true });
document.addEventListener('keydown', () => { if (!phoneState.blocked) { sound.unlock(); renderSoundControl(); } }, { capture: true });
function updateSoundSignals() {
  if (!run) { soundRun = null; soundedEvents.clear(); recoveryCursor = serviceCursor = 0; return; }
  if (soundRun !== run) { soundRun = run; soundedEvents.clear(); recoveryCursor = serviceCursor = 0; }
  if (run.status === 'running') {
    const events = activeSituations(run, scenario());
    const active = new Set(events.map(e => scenario().events.indexOf(e)));
    const started = events.filter(e => !soundedEvents.has(scenario().events.indexOf(e)));
    const types = new Set(started.map(e => e.type));
    if (types.has('attack')) sound.play('attack');
    else if (types.has('outage')) sound.play('maintenance');
    else if (types.has('demand') || types.has('cache')) sound.play('surge');
    else if (!active.size && soundedEvents.size && !run.nodes.some(n => run.nodeRuntime[n.id]?.state === 'down')) sound.play('recovered');
    soundedEvents = active;
  }
  if (run.recoveryLogTotal > recoveryCursor) {
    const newRecovery = run.recoveryLog.slice(-Math.min(run.recoveryLogTotal - recoveryCursor, run.recoveryLog.length));
    const types = new Set(newRecovery.map(e => e.type));
    if (types.has('shutdown')) sound.play('shutdown');
    if (types.has('reboot-start')) sound.play('reboot');
    if (newRecovery.some(e => e.type === 'reboot-complete' && run.last.nodes[e.nodeId] && !run.last.nodes[e.nodeId].down)) sound.play('recovered');
    recoveryCursor = run.recoveryLogTotal;
  }
  if (run.serviceLogTotal > serviceCursor) {
    const entries = run.serviceLog.slice(-Math.min(run.serviceLogTotal - serviceCursor, run.serviceLog.length));
    if (entries.some(e => e.type === 'replica-failed')) sound.play('shutdown');
    else if (entries.some(e => e.type === 'scale-out')) sound.play('place');
    if (entries.some(e => e.type === 'replica-replaced' && serviceSnapshot(run, e.nodeId)?.replicas.some(r => r.id === e.replicaId && !r.maintenanceRemaining))) sound.play('recovered');
    serviceCursor = run.serviceLogTotal;
  }
}

function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3800);
}
function point(event) {
  const r = board.getBoundingClientRect();
  return { x: Math.max(6, Math.min(94, (event.clientX - r.left) / r.width * 100)), y: Math.max(15, Math.min(85, (event.clientY - r.top) / r.height * 100)) };
}
function insideBoard(event) {
  const r = board.getBoundingClientRect();
  return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
}
function rememberDesign() {
  try { localStorage.setItem('cal.design.v1', JSON.stringify({ version: 1, nodes, edges })); } catch { /* Storage can be disabled; play remains available. */ }
}
function validateDesign(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length > 30 || value.edges.length > 100) throw new Error('Expected a version 1 design with at most 30 nodes and 100 connections.');
  const ids = new Set();
  let roots = 0;
  const cleanNodes = value.nodes.map(n => {
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(n.id) || Object.hasOwn(Object.prototype, n.id) || ids.has(n.id) || typeof n.kind !== 'string' || !(Object.hasOwn(CATALOG, n.kind) || n.kind === 'internet') || !Number.isFinite(n.x) || !Number.isFinite(n.y)) throw new Error('Invalid or duplicate service node.');
    ids.add(n.id);
    if (n.kind === 'internet') { roots++; if (n.id !== 'internet') throw new Error('Invalid Internet source.'); }
    else if (n.id === 'internet') throw new Error('The Internet source cannot be replaced.');
    const config = validateServiceSettings(n.kind, n.settings);
    if (!config.ok) throw new Error(config.reason);
    return { id: n.id, kind: n.kind, x: Math.max(6, Math.min(94, n.x)), y: Math.max(15, Math.min(85, n.y)), ...(config.settings ? { settings: { ...config.settings } } : {}) };
  });
  if (roots !== 1) throw new Error('A design needs exactly one Internet source.');
  if (getAllocation(cleanNodes) > 120) throw new Error('This design exceeds the 120-credit allocation budget.');
  const cleanEdges = [];
  for (const e of value.edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') throw new Error('Invalid connection.');
    const result = validateEdge(cleanNodes, cleanEdges, e.from, e.to);
    if (!result.ok) throw new Error(result.reason);
    cleanEdges.push({ from: e.from, to: e.to });
  }
  return { nodes: cleanNodes, edges: cleanEdges };
}
function invalidateRun() {
  if (run?.status === 'finished') { run = null; finishedShown = false; }
}
// Structural edits are accepted by the engine before the editor changes. Clock,
// queues and event targets survive; a deleted queue's backlog fails exactly once.
function changeDesign(nextNodes, nextEdges) {
  if (phoneState.blocked) return false;
  if (activeRound()) {
    const result = applyTopology(run, nextNodes, nextEdges);
    if (!result.ok) { toast(result.reason); return false; }
    nodes = run.nodes; edges = run.edges;
  } else { invalidateRun(); nodes = nextNodes; edges = nextEdges; }
  inspectorStamp = '';
  rememberDesign(); return true;
}
function addNode(kind, position) {
  if (phoneState.blocked) return;
  invalidateRun();
  if (nodes.length >= 30) return toast('This sandbox supports up to 30 nodes.');
  if (allocated() + CATALOG[kind].cost > scenario().budget) return toast(`Not enough credits for ${CATALOG[kind].name}. Remove a service first.`);
  let id;
  do { id = `${kind}-${++sequence}`; } while (nodes.some(n => n.id === id) || run?.nodeHistory[id]);
  const p = position ?? { x: 48, y: 45 };
  if (!changeDesign([...nodes, { id, kind, ...p }], edges)) return;
  selected = id; selectedEdge = null; placing = null;
  rememberDesign(); render(); sound.play('place'); toast(`${CATALOG[kind].name} placed. Click its source, then this node to connect.`);
}
function selectNode(id) {
  if (phoneState.blocked) return;
  placing = null;
  const choice = connectionClick(nodes, edges, wireFrom, id);
  if (choice.edge && !changeDesign(nodes, [...edges, choice.edge])) { sound.play('error'); return; }
  wireFrom = choice.source; selected = id;
  toast(choice.message);
  sound.play(choice.kind === 'connect' ? 'connect' : choice.kind === 'error' ? 'error' : 'select');
  selectedEdge = null; render();
}

const serviceCard = kind => {
  const s = CATALOG[kind];
  return `<button class="service-card" data-kind="${kind}" title="${escape(s.description)}" style="--color:${s.color}" aria-label="Place ${escape(s.name)} for ${s.cost} allocation credits${s.managed ? ' per replica' : ''}"><span class="service-icon">${s.icon}</span><span class="service-copy"><b>${escape(s.name)}</b><small>${s.capacity} req/s${s.managed ? ' / replica' : ''}</small></span><span class="service-cost">$${s.cost}</span></button>`;
};
function serviceForm(node, service) {
  const values = { ...service.config, replicas: service.desired };
  return `<section class="managed-settings"><h3>Replica management</h3><p id="service-live" class="service-live"></p><p id="service-policy-status" class="service-policy-status" role="status"></p><form id="service-settings" data-baseline="${escape(JSON.stringify(values))}"><label>Set desired replicas<input name="replicas" type="number" min="1" max="6" step="1" required value="${values.replicas}"></label><label class="policy-toggle"><input name="autoScale" type="checkbox" ${values.autoScale ? 'checked' : ''}> Enable autoscaler</label><label>Minimum replicas<input name="minReplicas" type="number" min="1" max="6" step="1" required value="${values.minReplicas}"></label><label>Maximum replicas<input name="maxReplicas" type="number" min="1" max="6" step="1" required value="${values.maxReplicas}"></label>${node.kind === 'containers' ? `<label>Target demand %<input name="targetUtilization" type="number" min="50" max="90" step="1" required value="${Math.round(values.targetUtilization * 100)}"></label>` : `<label>Backlog seconds / replica<input name="backlogSeconds" type="number" min="1" max="4" step="0.5" required value="${values.backlogSeconds}"></label>`}<button class="button primary" type="submit">Apply settings</button></form><p class="service-policy-help">${node.kind === 'containers' ? 'The autoscaler observes attempted load, including rejected/attack work. A load balancer or configured gateway integration still provides ingress.' : 'Workers pull queued jobs without an HTTP load balancer. The autoscaler observes connected queue backlog, not only completed throughput.'} Scale-out hold 2s, startup 3s, cooldown 4s; scale-in hold 8s. Paused time does not advance these timers. Unedited fields do not overwrite a live autoscaler’s changes. Saved designs keep settings, not live replica state.</p><button id="fail-replica" type="button" class="button fault-button" ${activeRound() && service.ready ? '' : 'disabled'}>Test one replica failure</button><p class="service-policy-help">Explicit fault injection: the service replaces that reserved slot after 3 simulated seconds. Overload alone does not inherently crash managed containers. Replacement is not autoscaling and requires no extra allocation.</p></section>`;
}
function bindServiceForm(node) {
  const form = $('service-settings'), baseline = JSON.parse(form.dataset.baseline), touched = new Set();
  form.addEventListener('input', event => { if (event.target.name) touched.add(event.target.name); });
  form.addEventListener('change', event => { if (event.target.name) touched.add(event.target.name); });
  form.onsubmit = event => {
    event.preventDefault(); if (phoneState.blocked || !form.reportValidity()) return;
    const values = { ...baseline };
    for (const field of form.elements) if (field.name) values[field.name] = field.type === 'checkbox' ? field.checked : Number(field.value) / (field.name === 'targetUtilization' ? 100 : 1);
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== baseline[key] || touched.has(key)));
    if (!Object.keys(changes).length) { toast('No settings changed. Live replica counts continue to update above.'); return; }
    if (!Object.hasOwn(changes, 'replicas') && (Object.hasOwn(changes, 'minReplicas') || Object.hasOwn(changes, 'maxReplicas'))) changes.replicas = Math.max(values.minReplicas, Math.min(values.maxReplicas, managedInfo(nodes.find(n => n.id === node.id)).desired));
    if (activeRound()) {
      const result = configureService(run, node.id, changes);
      if (!result.ok) { sound.play('error'); toast(result.reason); return; }
      nodes = run.nodes; edges = run.edges;
    } else {
      invalidateRun();
      const current = nodes.find(n => n.id === node.id);
      const checked = validateServiceSettings(node.kind, { ...validateServiceSettings(node.kind, current.settings).settings, ...changes });
      if (!checked.ok) { sound.play('error'); toast(checked.reason); return; }
      const candidate = nodes.map(n => n.id === node.id ? { ...n, settings: checked.settings } : n);
      if (getAllocation(candidate) > scenario().budget) { sound.play('error'); toast('Credit allocation budget exceeded.'); return; }
      if (!changeDesign(candidate, edges)) return;
    }
    inspectorStamp = ''; rememberDesign(); render(); sound.play('select'); toast('Service settings applied. New live slots warm up before serving.');
  };
  $('fail-replica').onclick = () => {
    if (!activeRound() || phoneState.blocked) return;
    const result = failServiceReplica(run, node.id);
    toast(result.ok ? 'Fault test: one replica stopped. Automatic replacement takes 3 simulated seconds; allocation is unchanged.' : result.reason);
    if (!result.ok) sound.play('error'); render();
  };
}
$('catalog').innerHTML = CATALOG_GROUPS.map(group => `<section class="catalog-group" aria-label="${escape(group.name)} services"><h3>${escape(group.name)}</h3><div class="catalog-group-cards">${group.kinds.map(serviceCard).join('')}</div></section>`).join('');
$('help-dialog').innerHTML = `<button class="close-dialog" aria-label="Close help">×</button><span class="eyebrow">CLOUD ARCHITECT LAB</span><h2>Build it. Keep it alive.</h2><p>A provider-neutral learning model with live traffic, attacks, maintenance and recovery. No real cloud resources are created.</p><ol><li><b>Place and connect.</b> Tap a card then the board, or drag a card on desktop. Click A then B to connect A → B. Drag nodes to move them; Escape or empty space cancels a pending wire.</li><li><b>Choose lifecycle.</b> Virtual machines, standalone app containers, SQL nodes and cache nodes use operator-managed game profiles. Event functions and managed stores throttle excess work. Container Service and Queue Worker Service maintain reserved replica slots with delayed startup/replacement.</li><li><b>Keep responsibilities separate.</b> Container Service is an HTTP backend reached through a load balancer or configured API gateway integration. Queue Workers pull queued jobs without an HTTP load balancer. Autoscaling changes counts, not routing. API Gateway → Load Balancer and API Gateway → Queue are supported integration paths.</li><li><b>Configure managed services.</b> Select the node to set desired replicas and optional autoscaler min/max/target. On phone use Details; closing a sheet requires Resume. Test failure deliberately stops one ready replica, and the manager replaces its slot after 3 simulated seconds without extra allocation.</li><li><b>Watch limits.</b> Credits reserve slots once, including startup/replacement. Scale-in releases allocation, not spent cloud money. Growth can be blocked by budget or maximum. Queued work is pending until completed; deleting a queue loses its backlog.</li></ol><div class="callout">This round declares 60% static web work (object-storage origin) and 40% data-backed API/job work (compute/consumer → data store). That is a workload definition, not a rule that every real application needs a database. Per-replica capacities and short timers are game assumptions.</div><p class="muted">Music adapts to severity. Use Music, Volume, Test sound and master mute. Phone play is landscape-only; rotation pauses the round and preserves state.</p><button class="button primary close-help">Let’s build →</button>`;
// Keep the model's timing explanation derived from the actual event schedule.
const eventExplanation = [...$('model-dialog').querySelectorAll('p')].find(p => p.querySelector('b')?.textContent === 'Automatic events:');
if (eventExplanation) eventExplanation.innerHTML = `<b>Automatic events:</b> ${[...ARCADE.events].sort((a, b) => a.at - b.at).map(e => `${escape(e.label)} ${e.at}–${e.until}s`).join('; ')}. Maintenance overlaps surges and attacks. Targets freeze at each window's start; no affected service means no maintenance banner.`;
const uptimeExplanation = document.createElement('p');
uptimeExplanation.innerHTML = '<b>Uptime:</b> percentage of observed simulated time with both static web and API healthy end-to-end paths. Maintenance, shutdown, reboot or missing connections can cause downtime. Overload can lower request success while healthy paths remain up. This is path availability, not a production cloud availability guarantee; grading still uses request success and final-design resilience.';
$('model-dialog').insertBefore(uptimeExplanation, $('model-dialog').querySelector('p'));
const modelCopy = {
  'Request success': 'Completed legitimate work / arrivals. Queue acceptance remains pending until a consumer completes its data-backed job. Deleting a queue fails its backlog once; disconnecting or replacing consumers preserves it; unfinished work fails at round end.',
  'Resilience check:': 'Operator-managed node loss and one ready managed replica loss are checked separately. Two ready replicas establish a path after one slot loss, not enough spare capacity, independent hosts/zones or whole-service failure tolerance. Ready counts, not merely autoscaler maximums, matter.',
  'Shutdown and reboot:': 'Operator-managed VM/app-container/SQL/cache profiles retain illustrative overload shutdown and manual reboot. Managed services throttle overload. Test failure explicitly injects one replica failure; the manager replaces it after 3s. Maintenance affects a frozen node or one managed slot and does not migrate after removal.',
  'Simulation:': 'Deterministic 0.25s steps, fractional customer work, shared capacity ledgers and equal traffic splitting. Service replica dispatch abstracts its upstream load-balancer/gateway integration, not bundled public ingress. Autoscaler hold/startup/cooldown delays and allocation limits are modeled; real billing, network/VPC setup, authentication, request schemas, in-flight retries and latency distributions are not.',
  'Persistence:': 'Validated design JSON includes service settings and configured starting replicas, not current live replica state. Historical kind IDs remain compatible while display names are generic. Local round summaries retain bounded topology, recovery and managed-service logs plus counters. Nothing is uploaded.',
};
for (const p of $('model-dialog').querySelectorAll('p')) {
  const heading = p.querySelector('b')?.textContent;
  if (modelCopy[heading]) p.innerHTML = `<b>${escape(heading)}</b> ${escape(modelCopy[heading])}`;
}

function renderNodes() {
  const liveIds = new Set(nodes.map(n => n.id));
  for (const element of [...$('nodes').children]) if (!liveIds.has(element.dataset.id)) element.remove();
  for (const n of nodes) {
    const s = CATALOG[n.kind] ?? { name: 'Internet', short: 'INTERNET', icon: '◉', color: 'var(--accent)' };
    let element = [...$('nodes').children].find(el => el.dataset.id === n.id);
    if (element && element.dataset.kind !== n.kind) { element.remove(); element = null; }
    if (!element) {
      element = document.createElement('button'); element.className = 'node'; element.dataset.id = n.id; element.dataset.kind = n.kind;
      element.innerHTML = `<span class="node-body"><span class="node-glyph">${s.icon}</span>${s.managed ? '<span class="replica-badge"></span>' : ''}<span class="node-meter"><i></i></span></span><b>${s.short}</b><small></small>`;
      element.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false || phoneState.blocked) return;
        event.stopPropagation();
        element.setPointerCapture(event.pointerId);
        const current = nodes.find(node => node.id === n.id);
        drag = { type: 'node', id: n.id, pointerId: event.pointerId, element, origin: { x: current.x, y: current.y }, startX: event.clientX, startY: event.clientY, moved: false };
      });
      element.addEventListener('lostpointercapture', event => { if (drag?.element === element && drag.pointerId === event.pointerId) cancelDrag(); });
      element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(n.id); } });
      $('nodes').append(element);
    }
    const stat = run?.last.nodes[n.id];
    const service = managedInfo(n);
    const utilization = n.kind === 'internet' ? 0 : stat?.utilization ?? 0;
    const health = serviceHealth(run, n, scenario()), state = health.state;
    element.className = `node ${n.kind === 'internet' ? 'internet' : ''} ${selected === n.id ? 'selected' : ''} ${wireFrom === n.id ? 'wire-source' : ''} ${health.down ? 'down' : utilization > 1.001 ? 'overloaded' : utilization > .8 ? 'hot' : ''} state-${state} ${stat?.blocked > 0 ? 'blocking' : ''}`;
    element.style.cssText = `left:${n.x}%;top:${n.y}%;--color:${s.color}`;
    element.setAttribute('aria-label', `${s.name}, ${n.id}${health.down ? ', offline' : stat ? `, ${Math.round(utilization * 100)} percent demand` : ''}`);
    element.querySelector('.node-meter i').style.width = `${Math.min(1, utilization) * 100}%`;
    element.querySelector('small').textContent = service ? run ? `${service.ready}/${service.desired} ready` : `${service.desired} configured` : state === 'maintenance' ? `MAINT. ${Math.ceil(health.maintenanceRemaining)}s` : state === 'rebooting' ? `REBOOT ${Math.ceil(health.rebootRemaining)}s` : state === 'down' ? 'TAP TO REBOOT' : n.kind === 'internet' ? 'TRAFFIC SOURCE' : state === 'throttled' ? 'THROTTLING' : stat ? `${Math.round(stat.load)} / ${stat.capacity} req/s` : `${s.cost} credits`;
    if (service) element.querySelector('.replica-badge').textContent = run ? `${service.ready}/${service.desired}` : String(service.desired);
  }
}
function edgeGeometry(e) {
  const from = nodes.find(n => n.id === e.from), to = nodes.find(n => n.id === e.to);
  if (!from || !to) return null;
  const w = board.clientWidth, h = board.clientHeight;
  if (!w || !h) return null;
  const x1 = from.x * w / 100, y1 = from.y * h / 100 - 13;
  const x2 = to.x * w / 100, y2 = to.y * h / 100 - 13;
  const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy) || 1;
  const offset = Math.min(w < 600 ? 24 : 31, length * .3);
  return { x1: (x1 + dx / length * offset) / w * 1000, y1: (y1 + dy / length * offset) / h * 580,
    x2: (x2 - dx / length * offset) / w * 1000, y2: (y2 - dy / length * offset) / h * 580 };
}
function renderEdges() {
  $('edge-layer').replaceChildren();
  for (const e of edges) {
    const geometry = edgeGeometry(e); if (!geometry) continue;
    const { x1, y1, x2, y2 } = geometry;
    const d = `M${x1},${y1} L${x2},${y2}`;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (selectedEdge === `${e.from}:${e.to}`) group.classList.add('selected-wire');
    for (const className of ['wire-hit', 'wire-line']) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('class', className);
      if (className === 'wire-hit') {
        p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button'); p.setAttribute('aria-label', `Select connection ${e.from} to ${e.to}`);
        const select = event => { event.stopPropagation(); selectedEdge = `${e.from}:${e.to}`; selected = null; wireFrom = null; renderInspector(); renderEdges(); renderPhoneControls(); };
        p.addEventListener('click', select); p.addEventListener('keydown', event => { if (event.key === 'Enter') select(event); });
      }
      group.append(p);
    }
    $('edge-layer').append(group);
  }
  renderTraffic();
}
function renderTraffic() {
  const present = new Set();
  if (run && run.status !== 'finished') {
    const time = reducedMotion.matches ? 0 : run.time + run._remainder;
    let total = 0;
    for (const e of edges) {
      const flow = run.last.edges?.[`${e.from}:${e.to}`];
      if (!flow) continue;
      const geometry = edgeGeometry(e); if (!geometry) continue;
      for (const type of ['legitimate', 'malicious']) {
        const rate = flow[type] ?? 0;
        if (rate < .01) continue;
        const length = Math.hypot((geometry.x2 - geometry.x1) * board.clientWidth / 1000, (geometry.y2 - geometry.y1) * board.clientHeight / 580);
        const count = Math.min(18, Math.max(2, Math.floor(length / 14)), Math.max(2, Math.ceil(rate / 5)));
        for (let i = 0; i < count && total < 450; i++, total++) {
          const key = `${e.from}:${e.to}:${type}:${i}`; present.add(key);
          let dot = packets.get(key);
          if (!dot) {
            dot = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            dot.setAttribute('class', `traffic-packet ${type === 'malicious' ? 'attack-packet' : 'request-packet'}`);
            dot.dataset.edge = `${e.from}:${e.to}`;
            $('traffic-layer').append(dot); packets.set(key, dot);
          }
          const progress = (time / (type === 'malicious' ? .95 : 1.35) + i / count) % 1;
          dot.setAttribute('cx', geometry.x1 + (geometry.x2 - geometry.x1) * progress);
          dot.setAttribute('cy', geometry.y1 + (geometry.y2 - geometry.y1) * progress);
          const radius = type === 'malicious' ? 5.5 : 4;
          dot.setAttribute('rx', radius * 1000 / board.clientWidth); dot.setAttribute('ry', radius * 580 / board.clientHeight);
        }
      }
    }
  }
  for (const [key, dot] of packets) if (!present.has(key)) { dot.remove(); packets.delete(key); }
}
function renderInspector() {
  const snapshots = run ? Object.fromEntries(Object.keys(run.services).map(id => [id, serviceSnapshot(run, id)])) : {};
  const audit = analyzeTopology(nodes, edges, snapshots);
  const hasFailureTarget = nodes.some(n => ['compute', 'fargate', 'cache', 'rds', ...MANAGED_KINDS].includes(n.kind));
  const n = nodes.find(n => n.id === selected);
  const s = n ? CATALOG[n.kind] : null;
  const stat = n && run?.last.nodes[n.id];
  const service = managedInfo(n);
  const health = n ? serviceHealth(run, n, scenario()) : null;
  const state = health?.state ?? 'healthy';
  // Keep live action buttons stable between ticks so a pointerdown/up cannot lose
  // its target while the inspector refreshes. Only metric spans update in place.
  const key = selectedEdge ?? selected ?? 'overview';
  const stamp = JSON.stringify([key, service ? 'managed' : state, run?.status ?? 'ready', service?.config ?? null, service ? 0 : allocated(), run?.editsTotal ?? 0]);
  const rebuild = inspectorKey !== key || inspectorStamp !== stamp;
  inspectorKey = key; inspectorStamp = stamp;
  if (rebuild) {
  if (selectedEdge) {
    const [from, to] = selectedEdge.split(':');
    $('inspector-content').innerHTML = `<span class="tag">DIRECTED CONNECTION</span><h2>${escape(from)} → ${escape(to)}</h2><p>Requests flow downstream. A branch splits traffic; it does not multiply customer successes.</p><button id="remove-edge" class="danger-button" ${editable() ? '' : 'disabled'}>Remove connection</button>`;
    $('remove-edge').onclick = () => { if (changeDesign(nodes, edges.filter(e => `${e.from}:${e.to}` !== selectedEdge))) { selectedEdge = null; sound.play('remove'); render(); } };
  } else if (n && s) {
    const shutdown = s.overloadMode === 'shutdown';
    const rule = service ? `Each reserved slot costs $${s.cost} allocation and supplies ${s.capacity} req/s when ready. Live growth/startup and fault replacement take 3 simulated seconds. Overload rejects excess work, not an inherent container crash. Replacement is automatic; ingress/load balancing is separate.` : shutdown ? `Demand above 105% for ${s.overloadToleranceS}s shuts this operator-managed game profile down. Manual reboot takes ${s.rebootS}s.` : s.overloadMode === 'throttle' ? 'Excess work is throttled in this profile; no manual reboot.' : 'Fixed modeled throughput. These limits are game values, not product quotas.';
    $('inspector-content').innerHTML = `<span class="service-icon inspector-icon" style="--color:${s.color}">${s.icon}</span><span class="tag">${escape(s.category.toUpperCase())}</span><h2>${escape(s.name)}</h2><p>${escape(s.description)}</p><dl><dt>Allocation</dt><dd><span id="node-allocation"></span> credits</dd><dt>Ready / total</dt><dd><span id="node-capacity"></span> req/s</dd><dt>Demand</dt><dd><span id="node-load"></span> req/s</dd><dt>State</dt><dd id="node-state"></dd><dt>${service ? 'Replicas' : 'Overload strain'}</dt><dd id="node-strain"></dd><dt>Queue backlog</dt><dd id="node-queue"></dd><dt>Node ID</dt><dd>${escape(n.id)}</dd></dl><p class="service-rule">${escape(rule)}</p><p class="profile-example"><b>Example:</b> ${escape(s.example ?? 'Illustrative component')}<br>${escape(s.managementHint ?? '')}</p>${service ? serviceForm(n, service) : ''}${shutdown ? `<button id="reboot-node" class="button reboot-button" ${activeRound() && state === 'down' ? '' : 'disabled'}>↻ Reboot ${escape(s.short)} · ${s.rebootS}s</button>` : ''}<button id="remove-node" class="danger-button">Remove service & release allocation</button>`;
    $('remove-node').onclick = () => { const removed = selected; if (changeDesign(nodes.filter(node => node.id !== removed), edges.filter(e => e.from !== removed && e.to !== removed))) { selected = null; if (wireFrom === removed) wireFrom = null; sound.play('remove'); render(); } };
    if ($('reboot-node')) $('reboot-node').onclick = () => { const result = rebootNode(run, n.id); toast(result.ok ? `Reboot started. ${s.rebootS} simulated seconds to recover.` : result.reason); inspectorStamp = ''; render(); };
    if (service) {
      const settings = $('service-settings').closest('.managed-settings');
      const explanation = document.createElement('details'); explanation.className = 'service-explanation';
      const summary = document.createElement('summary'); summary.textContent = 'How replicas, scaling and allocation work'; explanation.append(summary);
      explanation.append(...settings.querySelectorAll('.service-policy-help'), ...$('inspector-content').querySelectorAll('.service-rule,.profile-example'));
      settings.append(explanation);
      $('inspector-content').querySelector('h2').after(settings);
      bindServiceForm(n, service);
    }
  } else {
    $('inspector-content').innerHTML = `<span class="tag">${run?.status === 'running' ? 'EXPERIMENT RUNNING' : run?.status === 'paused' ? 'ROUND PAUSED' : run?.status === 'finished' ? 'ROUND COMPLETE' : 'BUILD MODE'}</span><h2>${escape(scenario().name)}</h2><p>${escape(scenario().description)}</p><div class="hint-callout">${escape(scenario().lesson)}<br><br>Select a service to inspect its role and live demand. Select a connection to remove it.</div>`;
  }
  }
  if (n && s && !selectedEdge) {
    $('node-allocation').textContent = service?.allocation ?? s.cost;
    $('node-capacity').textContent = `${service ? service.capacity : health.down ? 0 : stat?.capacity ?? s.capacity} / ${service ? service.desired * s.capacity : s.capacity}`;
    $('node-load').textContent = stat ? stat.load.toFixed(1) : '—';
    $('node-state').textContent = service ? `${service.status.toUpperCase()} · ${service.ready}/${service.desired} ready` : state === 'maintenance' ? `Maintenance · ${Math.ceil(health.maintenanceRemaining)}s` : state === 'rebooting' ? `Rebooting · ${Math.ceil(health.rebootRemaining)}s` : state.toUpperCase();
    $('node-strain').textContent = service ? `${service.ready} ready, ${service.starting} starting, ${service.replacing} replacing` : s.overloadMode === 'shutdown' ? `${(stat?.overloadS ?? 0).toFixed(1)} / ${s.overloadToleranceS}s` : '—';
    $('node-queue').textContent = num(n.kind === 'queueworker' ? service?.metric?.value ?? 0 : stat?.queued ?? 0);
    if (service) {
      $('service-live').textContent = `Desired ${service.desired} · ready ${service.ready} · maintenance ${service.maintenance} · $${service.allocation} reserved`;
      $('service-policy-status').textContent = !service.config.autoScale ? 'Autoscaler off: desired count is manual.' : service.blockedReason === 'budget' ? 'Scale-out blocked: allocation budget.' : service.blockedReason === 'max' ? 'Autoscaler at configured maximum.' : `Autoscaler active · ${service.metric?.type === 'backlog' ? `${num(service.metric.value)} queued jobs` : `${(service.metric?.value ?? 0).toFixed(1)} attempted req/s`}`;
      $('fail-replica').disabled = !activeRound() || !service.ready;
    }
  }
  const checks = [
    { okay: audit.hasWeb, text: audit.hasWeb ? 'Static web origin connected' : 'Missing static web origin' },
    { okay: audit.hasApi, text: audit.hasApi ? 'API worker → database connected' : 'Missing API → database path' },
    { okay: hasFailureTarget && !audit.spofs.length, text: !hasFailureTarget ? 'No eligible failure targets (not tested)' : audit.spofs.length ? `${audit.spofs.length} modeled single-node path risk${audit.spofs.length > 1 ? 's' : ''}` : 'No modeled single-node path loss' },
    ...audit.warnings.filter(w => !w.startsWith('No complete')).slice(0, 4).map(text => ({ okay: false, text })),
  ];
   $('checks').innerHTML = checks.map(c => `<div class="check ${c.okay ? '' : 'warn'}"><span>${c.okay ? '✓' : '△'}</span>${escape(c.text)}</div>`).join('') + '<p class="audit-limit">Path checks are not a capacity or cloud availability guarantee.</p>';
}
function renderMetrics() {
  const m = run?.metrics, elapsed = run?.time ?? 0, remaining = Math.max(0, 120 - elapsed);
  const a = run?.availability;
  $('uptime').innerHTML = `${a?.observedSeconds ? percent(a.upSeconds / a.observedSeconds) : '—'}<sub>%</sub>`;
  $('downtime').textContent = a?.observedSeconds ? `${a.downtimeSeconds.toFixed(1)}s downtime / ${a.observedSeconds.toFixed(1)}s observed` : 'No observed time yet';
  $('clock').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
  $('phase').textContent = !run ? 'Build now or adapt live' : run.status === 'finished' ? 'Round complete' : run.status === 'paused' ? 'Paused · live editing available' : run.last.event ?? 'Demand rising';
  $('success').innerHTML = `${m?.arrived ? percent(m.completed / m.arrived) : '—'}<sub>%</sub>`;
  $('completed').textContent = m?.arrived ? `${num(m.completed)} / ${num(m.arrived)} completed` : 'No traffic yet';
  $('rps').innerHTML = `${Math.round(run?.last.rps ?? 0)} <sub>req/s</sub>`;
  $('blocked').textContent = `${num(m?.attacksBlocked ?? 0)} malicious requests blocked`;
  $('failed').textContent = num(m?.failed ?? 0); $('pending').textContent = num(m?.pending ?? 0);
  $('credits').innerHTML = `${scenario().budget - allocated()} <sub>credits</sub>`;
  $('spent').textContent = `${allocated()} / ${scenario().budget} allocated`;
  catalogAvailability();
  $('start').textContent = !run || run.status === 'ready' ? '▶  Run simulation' : run.status === 'running' ? 'Ⅱ  Pause simulation' : run.status === 'paused' ? '▶  Resume simulation' : '↺  Run again';
  const situation = describeSituation(run, scenario());
  $('event-strip').className = `event-strip situation-${situation.tone}`;
  if ($('event-name').textContent !== situation.title) $('event-name').textContent = situation.title;
  $('event-copy').textContent = situation.message;
  $('timeline-progress').style.width = `${elapsed / 1.2}%`; $('playhead').style.left = `${elapsed / 1.2}%`;
  $('event-markers').innerHTML = scenario().events.map(e => `<span style="left:${e.at / 1.2}%;width:${(e.until - e.at) / 1.2}%" title="${escape(`${e.label}: ${e.at}–${e.until}s`)}"></span>`).join('');
  $('chart-line').setAttribute('d', (run?.history ?? []).filter((_, i) => i % 4 === 0).map((p, i) => `${i ? 'L' : 'M'}${p.time / 120 * 800},${40 - p.success * 36}`).join(' '));
  document.querySelectorAll('[data-template],#load').forEach(button => { button.disabled = !!activeRound(); });
  board.classList.toggle('simulating', !!run && run.status !== 'ready'); board.classList.toggle('paused', run?.status !== 'running');
}
function render() {
  renderNodes(); renderEdges(); renderInspector(); renderMetrics();
  $('empty-hint').hidden = nodes.length > 1;
  board.classList.toggle('placing-service', !!placing);
  $('canvas-hint').textContent = placing ? `Tap the grid to place ${CATALOG[placing].name}.` : wireFrom ? `${wireFrom} selected → click a destination. Escape or click empty space to cancel.` : 'Click A, then B to connect. Drag a node to move it.';
  catalogAvailability();
  renderPhoneControls();
}
function resetRound() { sound.silence(); run = null; selected = null; selectedEdge = null; wireFrom = null; finishedShown = false; inspectorStamp = ''; updateSoundSignals(); render(); }
function launch() {
  if (phoneState.blocked) return;
  if (run?.status === 'running') { run.status = 'paused'; sound.silence(); sound.play('pause'); render(); return; }
  if (run?.status === 'paused') { run.status = 'running'; lastFrame = performance.now(); sound.play('start'); render(); return; }
  run = createRun('arcade', nodes, edges); run.status = 'running'; nodes = run.nodes; edges = run.edges;
  placing = null; wireFrom = null; selected = null; finishedShown = false; lastFrame = performance.now(); rememberDesign(); sound.play('start'); render();
}
function finish() {
  if (finishedShown) return;
  finishedShown = true;
  sound.updateMusic(false);
  sound.play('complete');
  const result = summarizeRun(run);
  $('grade').textContent = result.grade; $('grade').classList.toggle('bad', result.grade !== 'A');
  $('result-title').textContent = result.success >= .98 ? 'Your cloud held its ground.' : 'You found the pressure point.';
  $('result-subtitle').textContent = `${scenario().name} · ${run.editsTotal} live edits · ${run.shutdowns} shutdowns · ${run.reboots} reboots`;
  $('result-metrics').innerHTML = `<div><strong>${result.uptime === null ? '—' : percent(result.uptime)}%</strong><small>UPTIME</small></div><div><strong>${result.availability.downtimeSeconds.toFixed(1)}s</strong><small>DOWNTIME</small></div><div><strong>${percent(result.success)}%</strong><small>REQUEST SUCCESS</small></div><div><strong>${num(run.metrics.failed)}</strong><small>FAILED REQUESTS</small></div>`;
  const findings = buildAssessments(run, result);
  const symbols = { pass: '✓', fail: '✕', info: '•' };
  const labels = { pass: 'Passed', fail: 'Failed', info: 'Information / not established' };
  $('result-findings').innerHTML = findings.map(f => `<div class="finding" data-outcome="${f.outcome}"><strong class="assessment-title"><span class="assessment-icon assessment-${f.outcome}" role="img" aria-label="${labels[f.outcome]}">${symbols[f.outcome]}</span>${escape(f.title)}</strong><p>${escape(f.text)}</p></div>`).join('');
  try {
    const old = JSON.parse(localStorage.getItem('cal.rounds.v1') ?? '[]');
    localStorage.setItem('cal.rounds.v1', JSON.stringify([...Array.isArray(old) ? old : [], { at: new Date().toISOString(), scenario: run.scenarioId, credits: allocated(), grade: result.grade, metrics: run.metrics, uptime: result.uptime, availability: result.availability, bottlenecks: result.bottlenecks, spofs: result.topology.spofs, failureEvidence: result.failureEvidence, edits: run.edits, editsTotal: run.editsTotal, discardedQueuedWork: run.discardedQueuedWork, recoveryLog: run.recoveryLog, shutdowns: run.shutdowns, reboots: run.reboots, services: result.services, serviceLog: run.serviceLog, serviceLogTotal: run.serviceLogTotal, managedFailures: run.managedFailures, replacements: run.replacements, scaleOuts: run.scaleOuts, scaleIns: run.scaleIns, budgetBlocks: run.budgetBlocks }].slice(-20)));
  } catch { toast('Round complete. Browser storage is unavailable; this result was not saved.'); }
  $('results-dialog').showModal(); render();
}

document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('pointerdown', event => {
    if (card.disabled || event.button !== 0 || event.isPrimary === false || phoneState.blocked) return;
    card.dataset.dragged = '';
    if (event.pointerType === 'touch') {
      const gesture = beginTap(event); touchCards.set(card, gesture); catalogTouch = { card, gesture };
      return; // No capture: the browser owns vertical catalog panning.
    }
    touchCards.delete(card);
    card.setPointerCapture(event.pointerId);
    drag = { type: 'catalog', kind: card.dataset.kind, pointerId: event.pointerId, element: card, startX: event.clientX, startY: event.clientY, moved: false, card };
  });
  card.addEventListener('lostpointercapture', event => { if (drag?.element === card && drag.pointerId === event.pointerId) cancelDrag(); });
  card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') touchCards.delete(card); });
  card.addEventListener('click', event => {
    if (phoneState.blocked) return;
    const touch = touchCards.get(card); touchCards.delete(card);
    if (touch && !isTap(touch)) { event.preventDefault(); return; }
    if (card.dataset.dragged === 'true') { card.dataset.dragged = ''; return; }
    placing = placing === card.dataset.kind ? null : card.dataset.kind; wireFrom = null; render();
    if (placing) toast(`Tap an empty grid location to place ${CATALOG[placing].name}.`);
  });
});
window.addEventListener('pointermove', event => {
  if (catalogTouch) moveTap(catalogTouch.gesture, event);
  moveTap(boardGesture, event);
  if (!drag || drag.pointerId !== event.pointerId || phoneState.blocked) return;
  if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (drag.type === 'node') {
    const n = nodes.find(n => n.id === drag.id); if (!n) return;
    wireFrom = null;
    Object.assign(n, point(event)); renderNodes(); renderEdges();
  } else {
    if (!drag.ghost) { drag.ghost = document.createElement('div'); drag.ghost.className = 'drag-ghost'; drag.ghost.textContent = CATALOG[drag.kind].name; document.body.append(drag.ghost); }
    drag.ghost.style.left = `${event.clientX + 12}px`; drag.ghost.style.top = `${event.clientY + 12}px`;
  }
});
window.addEventListener('pointerup', event => {
  if (catalogTouch?.gesture.pointerId === event.pointerId) catalogTouch = null;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const action = drag; drag = null; action.ghost?.remove();
  if (action.type === 'node') { if (!action.moved) selectNode(action.id); else { invalidateRun(); rememberDesign(); render(); } }
  else if (action.moved) { action.card.dataset.dragged = 'true'; if (insideBoard(event)) addNode(action.kind, point(event)); }
});
window.addEventListener('pointercancel', event => {
  if (catalogTouch?.gesture.pointerId === event.pointerId) { catalogTouch.gesture.cancelled = true; catalogTouch = null; }
  if (boardGesture?.pointerId === event.pointerId) boardGesture.cancelled = true;
  if (drag?.pointerId === event.pointerId) cancelDrag();
});
board.addEventListener('pointerdown', event => {
  if (event.target.closest('.node') || event.target.closest('.wire-hit') || phoneState.blocked) return;
  boardGesture = beginTap(event);
});
board.addEventListener('click', event => {
  if (event.target.closest('.node') || event.target.closest('.wire-hit')) return;
  if (phoneState.blocked) return;
  const gesture = boardGesture; boardGesture = null;
  if (gesture && !isTap(gesture)) return;
  if (placing) addNode(placing, point(event));
  else { selected = null; selectedEdge = null; wireFrom = null; render(); }
});
$('fit').onclick = () => { selected = null; selectedEdge = null; placing = null; wireFrom = null; render(); };
$('sound-toggle').onclick = () => { sound.setEnabled(!sound.enabled); renderSoundControl(); if (sound.enabled) sound.play('select'); };
$('music-toggle').onclick = () => { sound.setMusicEnabled(!sound.musicEnabled); renderSoundControl(); };
$('audio-volume').oninput = event => { sound.setVolume(Number(event.target.value) / 100); sound.unlock(); renderSoundControl(); };
$('audio-volume').onchange = () => sound.play('select');
$('test-audio').onclick = () => { sound.unlock(); sound.play('start'); renderSoundControl(); };
$('start').onclick = launch; $('retry').onclick = resetRound;
$('speed').onclick = () => { speed = speed === 1 ? 4 : 1; $('speed').textContent = `${speed}× speed`; renderPhoneControls(); };
$('phone-start').onclick = launch;
$('phone-speed').onclick = () => { $('speed').click(); renderPhoneControls(); };
$('phone-mute').onclick = () => $('sound-toggle').click();
$('phone-reboot').onclick = () => { if (!phoneState.blocked) ($('fail-replica') ?? $('reboot-node'))?.click(); };
$('phone-delete').onclick = () => { if (!phoneState.blocked) ($('remove-edge') ?? $('remove-node'))?.click(); };
// Lead with the selected service; keep full round context available below it.
$('phone-details-content').after($('phone-situation-copy'), $('phone-round-summary'));
$('phone-details').onclick = () => showPhoneSheet('phone-details-dialog', 'phone-details-content', [document.querySelector('.inspector')]);
$('selection-details').onclick = () => {
  if (phoneState.phone || desktopLayout) $('phone-details').click();
  else document.querySelector('.inspector').scrollIntoView({ block: 'start', behavior: 'smooth' });
};
$('phone-menu').onclick = () => showPhoneSheet('phone-menu-dialog', 'phone-menu-content', [document.querySelector('.audio-controls'), document.querySelector('.templates'), document.querySelector('.timeline')]);
for (const id of ['phone-details-dialog', 'phone-menu-dialog']) $(id).addEventListener('close', () => restoreSheet($(id)));
$('phone-help').onclick = () => { closePhoneSheets(); $('help').click(); };
$('phone-model').onclick = () => { closePhoneSheets(); $('model-info').click(); };
$('phone-about').onclick = () => { closePhoneSheets(); $('about').click(); };
document.querySelectorAll('[data-template]').forEach(button => { button.onclick = () => { if (activeRound()) return; ({ nodes, edges } = starterTopology(button.dataset.template)); resetRound(); rememberDesign(); toast('Template loaded. Arrange, connect, then run the arcade.'); }; });
$('help').onclick = () => $('help-dialog').showModal(); $('model-info').onclick = () => $('model-dialog').showModal();
$('about').onclick = () => { if (phoneState.blocked) return; pauseRound(); $('about-dialog').showModal(); };
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('.close-dialog').onclick = () => { dialog.close(); restoreSheet(dialog); };
  dialog.addEventListener('cancel', event => { if (sheetSlots.has(dialog)) { event.preventDefault(); dialog.close(); restoreSheet(dialog); } });
});
document.querySelector('.close-help').onclick = () => $('help-dialog').close();
document.querySelector('.close-results').onclick = () => $('results-dialog').close();
$('result-retry').onclick = () => { $('results-dialog').close(); resetRound(); };
$('save').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, nodes, edges }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cloud-architect-design.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Design downloaded.');
};
$('load').onclick = () => $('design-file').click();
$('design-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (phoneState.blocked) throw new Error('Rotate to landscape before loading a design.');
    if (activeRound()) throw new Error('Rebuild this round before loading a whole design. Individual services and wires can be edited live.');
    if (file.size > 100_000) throw new Error('Design file is too large (maximum 100 KB).');
    const value = JSON.parse(await file.text()); const design = validateDesign(value);
    nodes = design.nodes; edges = design.edges;
    resetRound(); rememberDesign(); toast('Design loaded.');
  } catch (error) { toast(`Could not load design: ${error.message}`); }
  event.target.value = '';
};
document.addEventListener('keydown', event => {
  if (phoneState.blocked) return;
  if (event.key === 'Escape') { cancelDrag(); placing = null; wireFrom = null; render(); }
  if (event.key === 'Delete' && editable() && !document.querySelector('dialog[open]')) { if (selectedEdge) $('remove-edge')?.click(); else if (selected && selected !== 'internet') $('remove-node')?.click(); }
});
// Restore only a validated design, never arbitrary data or a half-finished run.
try {
  const raw = localStorage.getItem('cal.design.v1');
  if (raw) {
    const value = JSON.parse(raw); ({ nodes, edges } = validateDesign(value));
  }
} catch { toast('Saved design could not be restored; loaded the basic starter.'); }
updatePhoneLayout(); render(); renderSoundControl();
function frame(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .25) : 0; lastFrame = now;
  if (run?.status === 'running' && !phoneState.blocked) {
    stepRun(run, dt * speed);
    if (now - lastPaint > 120 || run.status === 'finished') { renderNodes(); renderMetrics(); renderInspector(); renderSoundControl(); renderPhoneControls(); lastPaint = now; }
    if (run.status === 'finished') finish();
  }
  updateSoundSignals();
  sound.updateMusic(run?.status === 'running' && !phoneState.blocked, musicMood(run, scenario()));
  const musicStatus = sound.musicStatus();
  if ($('music-status').textContent !== musicStatus) $('music-status').textContent = musicStatus;
  renderTraffic();
  requestAnimationFrame(frame);
}
new ResizeObserver(() => renderEdges()).observe(board);
window.addEventListener('resize', () => { cancelDrag(); updatePhoneLayout(); });
window.addEventListener('orientationchange', () => { cancelDrag(); updatePhoneLayout(); });
window.addEventListener('blur', cancelDrag);
coarsePointer.addEventListener('change', updatePhoneLayout);
window.visualViewport?.addEventListener('resize', () => { cancelDrag(); updatePhoneLayout(); });
window.visualViewport?.addEventListener('scroll', updatePhoneLayout);
// Backgrounding pauses rather than silently skipping incidents or time.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRound(); lastFrame = performance.now(); });
requestAnimationFrame(frame);
