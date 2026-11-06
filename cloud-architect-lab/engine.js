// Deterministic, fractional-request tutorial model. Capacities are requests/second,
// costs are game credits, and metrics count legitimate requests only. Malicious
// traffic consumes serving capacity but is never counted as a customer request.
import { MANAGED_KINDS, validateServiceSettings, allocation, newService, resizeService, serviceEvent, snapshot, completeServices, scaleServices } from './services.js';
export { MANAGED_KINDS, validateServiceSettings } from './services.js';
const spec = [
  ['shield', 'Traffic shield', 'WAF', '◇', 'security', 15, 400, 'Blocks malicious traffic within its capacity.', '#a78bfa'],
  ['cdn', 'Content delivery network', 'CDN', '◎', 'edge', 14, 250, 'Caches static content; requires a connected storage origin.', '#38bdf8'],
  ['alb', 'Load balancer', 'ALB', '⇄', 'network', 12, 180, 'Splits requests between application workers.', '#fbbf24'],
  ['compute', 'Compute instance', 'VM', '▣', 'compute', 10, 22, 'Application worker; requires a database path.', '#fb923c'],
  ['serverless', 'Serverless worker', 'FN', 'λ', 'compute', 18, 35, 'Managed application worker with a fixed modeled capacity.', '#f97316'],
  ['storage', 'Object storage', 'OBJ', '▤', 'data', 8, 200, 'Static website origin.', '#4ade80'],
  ['database', 'Database', 'DB', '▥', 'data', 18, 65, 'Shared API data capacity.', '#60a5fa'],
  ['cache', 'Data cache', 'RAM', '⚡', 'data', 12, 120, 'Serves API cache hits; misses use the database.', '#f472b6'],
  ['queue', 'Work queue', 'FIFO', '≋', 'messaging', 10, 90, 'Buffers up to five seconds of work for downstream consumers.', '#2dd4bf'],
];
export const CATALOG = Object.fromEntries(spec.map(([kind, name, short, icon, category, cost, capacity, description, color]) =>
  [kind, { name, short, icon, category, cost, capacity, description, color }]));

// Stable kind IDs preserve saves; display profiles are provider-neutral game models.
for (const [kind, name, short] of [
  ['shield', 'DDoS Protection', 'DDoS guard'], ['cdn', 'CDN', 'CDN'],
  ['alb', 'Application Load Balancer', 'ALB'], ['compute', 'Virtual Machine', 'VM'],
  ['serverless', 'Event Function', 'Function'], ['storage', 'Object Storage', 'Storage'],
  ['database', 'Managed Key-Value Store', 'Key-value'], ['cache', 'Cache Node', 'Cache'],
  ['queue', 'Message Queue', 'Queue'],
]) Object.assign(CATALOG[kind], { name, short });
for (const [kind, base, name, short, cost, capacity] of [
  ['fargate', 'compute', 'App Container', 'Container', 13, 26],
  ['apigw', 'alb', 'API Gateway', 'API GW', 10, 150],
  ['rds', 'database', 'SQL Database Node', 'SQL DB', 16, 20],
  ['aurora', 'database', 'Managed SQL Store', 'Managed SQL', 20, 50],
]) CATALOG[kind] = { ...CATALOG[base], name, short, cost, capacity };
CATALOG.apigw.description = 'Splits API requests between application workers; does not serve static web traffic.';
for (const entry of Object.values(CATALOG)) Object.assign(entry, { overloadMode: null, overloadToleranceS: 0, rebootS: 0 });
for (const [kind, overloadToleranceS, rebootS] of [
  ['compute', 5, 6], ['fargate', 7, 8], ['rds', 4, 7], ['cache', 6, 5],
]) Object.assign(CATALOG[kind], { overloadMode: 'shutdown', overloadToleranceS, rebootS });
for (const kind of ['serverless', 'database', 'aurora']) CATALOG[kind].overloadMode = 'throttle';
for (const [kind, name, short, cost] of [['containers', 'Container Service', 'Containers', 14], ['queueworker', 'Queue Worker Service', 'Workers', 12]]) {
  CATALOG[kind] = { ...CATALOG.compute, name, short, cost, capacity: 22, managed: true, startupS: 3, replacementS: 3, overloadMode: null, overloadToleranceS: 0, rebootS: 0,
    description: 'Managed replicas with illustrative reserved-slot allocation and optional autoscaling.' };
}
for (const [kind, description, example, managementHint] of [
  ['shield', 'Filters labeled volumetric attack traffic within modeled capacity only; WAF rules and authentication are not modeled.', 'AWS Shield or Cloudflare DDoS protection', 'Attack filtering only, not a general security boundary.'],
  ['cdn', 'Caches static content; requires a connected object-storage origin.', 'CloudFront or other CDN', 'Cache misses consume origin capacity; this tile does not add application workers.'],
  ['alb', 'Distributes HTTP requests across connected application workers; does not add workers.', 'Application load balancer', 'Provide worker capacity separately; routing alone does not scale workers.'],
  ['compute', 'Application worker on a virtual machine; requires a database path.', 'EC2 or Azure VM', 'Operator-managed game profile with modeled overload shutdown, manual reboot and worker maintenance.'],
  ['fargate', 'Application container worker; requires a database path. Its capacity is a different game profile, not an inherent speed advantage over a VM.', 'Docker container on a VM', 'Operator-managed game profile with modeled overload shutdown, manual reboot and worker maintenance.'],
  ['serverless', 'Event-driven application worker with fixed modeled throughput; excess work is throttled.', 'Lambda or Azure Functions', 'Managed function profile; no manual reboot in this model, not a real availability guarantee.'],
  ['storage', 'Object-storage origin for static website content.', 'S3 or Azure Blob', 'Fixed modeled origin throughput; object data type does not imply an availability guarantee.'],
  ['database', 'Managed key-value data capacity shared by API workers.', 'DynamoDB', 'Throttles excess work in this profile; key-value data type does not itself determine availability.'],
  ['rds', 'Operator-managed SQL database node with shared API data capacity.', 'Self-managed PostgreSQL/MySQL', 'Modeled overload shutdown, manual reboot and SQL-node maintenance; these rules describe this game profile, not all SQL databases.'],
  ['aurora', 'Managed relational data capacity shared by API workers.', 'Managed relational database', 'Throttles excess work in this profile; managed status is not failure-proof and SQL data type does not imply availability.'],
  ['cache', 'Serves API cache hits; misses use a connected database.', 'Self-managed Redis/Memcached', 'Operator-managed cache profile with modeled overload shutdown and manual reboot.'],
  ['queue', 'Buffers up to five modeled seconds of work for downstream queue consumers.', 'SQS or other durable queue', 'Consumers pull pending work; deleting this game tile fails its backlog, not a claim about real queue durability.'],
  ['apigw', 'Routes configured HTTP API integrations, including an ALB or message queue; does not serve static web traffic. Authentication and schema validation are not modeled yet.', 'API gateway with HTTP or queue integrations', 'Configure a downstream integration; routing does not supply worker capacity.'],
  ['containers', 'Managed HTTP application replicas with optional illustrative autoscale; requires an upstream HTTP integration and a database path, with no built-in public ingress.', 'Managed container service', 'Reserved replicas start and replace after modeled delays; optional illustrative autoscale stays within bounds and game-credit budget.'],
  ['queueworker', 'Managed worker replicas pull from connected queues only, then use a database path; no HTTP ingress.', 'Managed queue-consuming worker service', 'Reserved replicas start and replace after modeled delays; optional illustrative autoscale uses incoming backlog, bounds and game-credit budget.'],
]) Object.assign(CATALOG[kind], { description, example, managementHint: `${managementHint} Numbers are illustrative game profiles, not product quotas or physical availability guarantees.` });

export const ARCADE = {
  id: 'arcade', name: 'Live arcade', description: 'Build live through repeated maintenance, including overlaps with demand surges, cold caches and attacks.',
  lesson: 'Adapt capacity and paths while conserving customer work.', duration: 120, budget: 120,
  events: [
    { type: 'demand', at: 30, until: 60, multiplier: 2.4, label: 'Black Friday', description: 'Legitimate demand increases 2.4×.' },
    { type: 'cache', at: 45, until: 60, hitRate: 0.15, label: 'Cold cache', description: 'CDN and data-cache hit rates fall to 15%.' },
    { type: 'attack', at: 65, until: 90, attackRps: 90, label: 'DDoS attack', description: '90 malicious requests/second target exposed serving capacity.' },
    { type: 'outage', at: 95, until: 110, targetKinds: ['compute', 'fargate'], label: 'Scheduled maintenance', description: 'The first current virtual-machine or app-container worker is offline for scheduled maintenance.' },
    { type: 'outage', at: 105, until: 115, targetKinds: ['rds'], label: 'SQL node maintenance', description: 'One SQL database node, if present, is offline for scheduled maintenance.' },
    { type: 'outage', at: 20, until: 26, targetKinds: ['compute', 'fargate'], targetOffset: 0, label: 'Routine maintenance', description: 'One virtual-machine or app-container worker is offline before the demand surge.' },
    { type: 'outage', at: 52, until: 60, targetKinds: ['compute', 'fargate'], targetOffset: 1, label: 'Maintenance during surge', description: 'The second eligible worker (or the only worker) is offline during Black Friday and cold cache.' },
    { type: 'outage', at: 72, until: 82, targetKinds: ['compute', 'fargate'], targetOffset: 0, label: 'Maintenance under attack', description: 'One virtual-machine or app-container worker is offline during the DDoS attack.' },
    { type: 'outage', at: 55, until: 62, targetKinds: ['rds'], targetOffset: 0, label: 'SQL node maintenance during surge', description: 'One SQL database node is offline during the demand surge, cold cache and worker maintenance, continuing after the surge ends.' },
  ],
};

export const SCENARIOS = [
  ARCADE,
  { id: 'launch', name: 'Launch day', description: 'Growing demand and a malicious traffic burst.', lesson: 'Protect capacity and balance replicas.', duration: 120, budget: 120,
    events: [{ at: 65, until: 90, label: 'Attack burst', description: '65 malicious requests/second target exposed serving capacity.' }] },
  { id: 'cache', name: 'Cold caches', description: 'A cache-miss surge reaches the origin and database.', lesson: 'Size the uncached path as well as the fast path.', duration: 120, budget: 120,
    events: [{ at: 55, until: 85, label: 'Cache miss surge', description: 'CDN and database-cache hit rates fall to 15%.' }] },
  { id: 'failure', name: 'Instance outage', description: 'The first compute instance temporarily fails.', lesson: 'Reachable replicas need enough spare capacity.', duration: 120, budget: 120,
    events: [{ at: 65, until: 90, label: 'Compute outage', description: 'The first compute instance is unavailable, then recovers.' }] },
];
// Retain importable legacy fixtures with the same timings and effects.
for (const scenario of SCENARIOS.filter(s => s !== ARCADE)) {
  Object.assign(scenario.events[0], scenario.id === 'launch' ? { type: 'attack', attackRps: 65 }
    : scenario.id === 'cache' ? { type: 'cache', hitRate: 0.15 } : { type: 'outage' });
}

const ROOT = { id: 'internet', kind: 'internet', x: 7, y: 50 };
const TICK = 0.25;
const EPS = 1e-9;
for (const event of ARCADE.events.filter(e => e.type === 'outage' && e.targetKinds.includes('compute'))) {
  event.targetKinds.push(...MANAGED_KINDS);
  event.description = 'One worker instance or one frozen managed replica is unavailable during scheduled maintenance.';
}
const WORKERS = ['compute', 'serverless', 'fargate', 'containers'];
const CONSUMERS = [...WORKERS, 'queueworker'];
const DATABASES = ['database', 'rds', 'aurora'];
const SERVING = ['shield', 'cdn', 'alb', 'apigw', ...WORKERS];
const REMOVAL_TESTED = ['compute', 'fargate', 'cache', 'rds'];
const healthyRuntime = () => ({ state: 'healthy', overloadS: 0, recoverAt: 0, shutdowns: 0, reboots: 0 });

function cloneNodeSettings(node) {
  const result = validateServiceSettings(node.kind, node.settings);
  if (!result.ok) throw new TypeError(result.reason);
  return { ...node, ...(node.settings !== undefined ? { settings: { ...result.settings } } : {}) };
}

export function getAllocation(nodes, services = {}) { return allocation(nodes, services, CATALOG); }

export function serviceSnapshot(run, id) {
  return snapshot(run, id, SCENARIOS.find(s => s.id === run.scenarioId).events, CATALOG);
}

function refreshService(run, id) {
  const service = serviceSnapshot(run, id);
  const runtime = run.nodeRuntime[id];
  runtime.state = service.ready === service.desired ? 'healthy' : 'recovering';
  for (const slot of run.services[id].replicas) slot.maintenanceRemaining = service.replicas.find(s => s.id === slot.id).maintenanceRemaining;
  if (run.last.nodes[id]) Object.assign(run.last.nodes[id], { service, state: service.status, capacity: service.capacity, down: !service.ready,
    utilization: service.capacity ? run.last.nodes[id].load / service.capacity : run.last.nodes[id].load ? 1 : 0 });
}

export function configureService(run, id, changes) {
  const reject = reason => ({ ok: false, reason });
  if (!['ready', 'running', 'paused'].includes(run.status)) return reject('Round is not editable.');
  const old = run.services[id];
  if (!old) return reject('Managed service does not exist.');
  // Validate the patch itself before spreading it (including unsafe own keys).
  if (!changes || typeof changes !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(changes)) || Reflect.ownKeys(changes).some(k => {
    const descriptor = Object.getOwnPropertyDescriptor(changes, k);
    return !Object.hasOwn(old.config, k) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable;
  })) return reject('Unknown or unsafe setting.');
  // Reject non-primitives before clamp arithmetic can coerce an unsafe value.
  if (Object.entries(changes).some(([key, value]) => typeof value !== typeof old.config[key])) return reject('Invalid setting type.');
  const merged = { ...old.config, ...changes };
  if (!Object.hasOwn(changes, 'replicas') && (Object.hasOwn(changes, 'minReplicas') || Object.hasOwn(changes, 'maxReplicas') || changes.autoScale === false)) {
    merged.replicas = Math.max(merged.minReplicas, Math.min(merged.maxReplicas, old.desired));
  }
  const result = validateServiceSettings(run.nodes.find(n => n.id === id).kind, merged);
  if (!result.ok) return reject(result.reason);
  const config = result.settings;
  // Bounds changes clamp actual desired; toggling policy alone preserves it.
  const desired = Object.hasOwn(changes, 'replicas') ? config.replicas : Math.max(config.minReplicas, Math.min(config.maxReplicas, old.desired));
  const candidate = { ...old, config, replicas: old.replicas.map(s => ({ ...s })) };
  resizeService(candidate, id, desired, run.time);
  const services = { ...run.services, [id]: candidate };
  if (getAllocation(run.nodes, services) > SCENARIOS.find(s => s.id === run.scenarioId).budget) return reject('Credit budget exceeded.');
  run.services = services;
  run.nodes = run.nodes.map(n => n.id === id ? { ...n, settings: { ...config } } : n);
  serviceEvent(run, id, 'configured', { desired });
  refreshService(run, id);
  return { ok: true, reason: '' };
}

export function failServiceReplica(run, id) {
  const reject = reason => ({ ok: false, reason });
  if (!['running', 'paused'].includes(run.status)) return reject('Round must be running or paused.');
  const service = serviceSnapshot(run, id);
  if (!service) return reject('Managed service does not exist.');
  const eligible = service.replicas.find(s => s.state === 'ready' && !s.maintenanceRemaining);
  if (!eligible) return reject('No available ready replica.');
  const slot = run.services[id].replicas.find(s => s.id === eligible.id);
  slot.state = 'replacing'; slot.readyAt = run.time + 3;
  run.managedFailures++;
  serviceEvent(run, id, 'replica-failed', { replicaId: slot.id, reason: 'Explicit FAULT INJECTION; not an automatic overload crash.' });
  refreshService(run, id);
  return { ok: true, reason: '' };
}

function recoveryEvent(run, nodeId, type, at = run.time) {
  run.recoveryLog.push({ at, nodeId, type });
  run.recoveryLogTotal++;
  if (run.recoveryLog.length > 200) run.recoveryLog.splice(0, run.recoveryLog.length - 200);
}

function completeReboots(run, time) {
  for (const [id, runtime] of Object.entries(run.nodeRuntime)) {
    if (runtime.state !== 'rebooting' || runtime.recoverAt > time + EPS) continue;
    recoveryEvent(run, id, 'reboot-complete', runtime.recoverAt);
    runtime.state = 'healthy';
    runtime.overloadS = 0;
    runtime.recoverAt = 0;
  }
}

function outageTarget(run, event) {
  const eligible = run.nodes.filter(n => (event.targetKinds ?? ['compute', 'fargate']).includes(n.kind));
  return eligible[(event.targetOffset ?? 0) % eligible.length]?.id ?? null;
}

function freezeOutageTargets(run, time) {
  const events = SCENARIOS.find(s => s.id === run.scenarioId).events;
  for (const [index, event] of events.entries()) {
    if (event.type !== 'outage' || time < event.at || time >= event.until || Object.hasOwn(run.outageTargets, String(index))) continue;
    run.outageTargets[index] = outageTarget(run, event);
    const service = run.services[run.outageTargets[index]];
    run.outageReplicas[index] = service?.replicas[(event.targetOffset ?? 0) % service.replicas.length]?.id ?? null;
  }
}

// Read-only lookup also protects calls made exactly at maintenance start, before
// the next tick has frozen the event target. A frozen null must remain null.
function maintenanceRemaining(run, id, time) {
  if (run.scenarioId !== 'arcade') return 0;
  const events = SCENARIOS.find(s => s.id === run.scenarioId).events;
  let remaining = 0;
  for (const [index, event] of events.entries()) {
    if (event.type !== 'outage' || time < event.at || time >= event.until) continue;
    const target = Object.hasOwn(run.outageTargets, String(index)) ? run.outageTargets[index]
      : outageTarget(run, event);
    if (target === id) remaining = Math.max(remaining, event.until - time);
  }
  return remaining;
}

export function rebootNode(run, id) {
  const reject = reason => ({ ok: false, reason });
  if (run.scenarioId !== 'arcade') return reject('Manual reboot is available in Arcade only.');
  if (!['running', 'paused'].includes(run.status)) return reject('Round must be running or paused.');
  const node = run.nodes.find(n => n.id === id);
  if (!node) return reject('Service does not exist.');
  if (CATALOG[node.kind]?.overloadMode !== 'shutdown') return reject('This service throttles or does not support reboot.');
  if (maintenanceRemaining(run, id, run.time)) return reject('Scheduled maintenance cannot be bypassed.');
  const runtime = run.nodeRuntime[id];
  if (runtime.state !== 'down') return reject('Only a shutdown service can reboot.');
  runtime.state = 'rebooting';
  runtime.recoverAt = run.time + CATALOG[node.kind].rebootS;
  runtime.reboots++;
  run.reboots++;
  recoveryEvent(run, id, 'reboot-start');
  // Health is current at the simulation boundary; traffic remains last-tick data.
  if (run.last.nodes[id]) Object.assign(run.last.nodes[id], {
    state: 'rebooting', down: true, capacity: 0, rebootRemaining: CATALOG[node.kind].rebootS,
  });
  return { ok: true, reason: '' };
}
const ALLOWED = {
  internet: ['shield', 'cdn', 'alb', 'compute', 'serverless'],
  shield: ['cdn', 'alb', 'compute', 'serverless'],
  cdn: ['storage', 'alb', 'compute', 'serverless'],
  alb: ['compute', 'serverless'],
  compute: ['database', 'cache', 'queue'], serverless: ['database', 'cache', 'queue'],
  cache: ['database'], queue: ['compute', 'serverless'], storage: [], database: [],
};
for (const kind of ['internet', 'shield', 'cdn']) ALLOWED[kind].push('fargate', 'apigw');
ALLOWED.alb.push('fargate');
ALLOWED.alb.push('containers');
ALLOWED.apigw = ['alb', ...WORKERS, 'queue'];
for (const kind of CONSUMERS) ALLOWED[kind] = [...DATABASES, 'cache', 'queue'];
ALLOWED.cache = [...DATABASES];
ALLOWED.queue = ['compute', 'serverless', 'fargate', 'queueworker'];
ALLOWED.rds = [];
ALLOWED.aurora = [];

export function validateEdge(nodes, edges, from, to) {
  const source = nodes.find(n => n.id === from);
  const target = nodes.find(n => n.id === to);
  const reject = reason => ({ ok: false, reason });
  if (!source || !target) return reject('Both endpoints must exist.');
  if (from === to) return reject('Self links are not allowed.');
  if (target.kind === 'internet') return reject('Internet cannot have incoming links.');
  if (edges.some(e => e.from === from && e.to === to)) return reject('Duplicate link.');
  if (!ALLOWED[source.kind]?.includes(target.kind)) {
    if (target.kind === 'queueworker') return reject('Queue workers pull from a message queue; they do not accept HTTP ingress.');
    if (target.kind === 'containers') return reject('Container Service is a private backend. Connect an application load balancer or configured API gateway integration.');
    return reject('Incompatible service types.');
  }
  const seen = new Set();
  const visit = id => {
    if (id === from) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return edges.filter(e => e.from === id).some(e => visit(e.to));
  };
  if (visit(to)) return reject('This link would create a cycle.');
  return { ok: true, reason: '' };
}

function graph(nodes, edges) {
  const accepted = [];
  const warnings = [];
  for (const edge of edges) {
    const result = validateEdge(nodes, accepted, edge.from, edge.to);
    if (result.ok) accepted.push(edge);
    else warnings.push(`Invalid link ${edge.from} → ${edge.to}: ${result.reason}`);
  }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const children = id => accepted.filter(e => e.from === id).map(e => byId.get(e.to));
  const supports = (id, workload) => {
    const node = byId.get(id);
    if (!node) return false;
    if (workload === 'web') {
      if (node.kind === 'storage') return true;
      if (!['internet', 'shield', 'cdn'].includes(node.kind)) return false;
      return children(id).some(n => supports(n.id, workload));
    }
    if (DATABASES.includes(node.kind)) return true;
    if (node.kind === 'storage') return false;
    return children(id).some(n => supports(n.id, workload));
  };
  return { byId, children, supports, warnings };
}

export function analyzeTopology(nodes, edges, services = {}) {
  const g = graph(nodes, edges);
  const hasWeb = g.supports('internet', 'web');
  const hasApi = g.supports('internet', 'api');
  const reachable = new Set();
  const walk = id => {
    if (reachable.has(id)) return;
    reachable.add(id);
    g.children(id).forEach(n => walk(n.id));
  };
  walk('internet');
  const warnings = [...g.warnings];
  if (nodes.length > 30) warnings.push('More than 30 nodes exceeds the tutorial layout limit.');
  const ids = new Set();
  for (const n of nodes) {
    if (ids.has(n.id)) warnings.push(`Duplicate node ID: ${n.id}.`);
    ids.add(n.id);
    if (!ALLOWED[n.kind]) warnings.push(`Unknown service type: ${n.kind}.`);
    if (!reachable.has(n.id)) warnings.push(`Disconnected node: ${CATALOG[n.kind]?.name ?? n.id} (${n.id}).`);
    if ([...CONSUMERS, 'cache', 'queue'].includes(n.kind) && reachable.has(n.id) && !g.supports(n.id, 'api')) {
      warnings.push(`No database path from ${n.id}.`);
    }
    if (n.kind === 'cdn' && !g.supports(n.id, 'web')) warnings.push(`CDN ${n.id} has no storage origin.`);
  }
  const spofs = [];
  // Reachability test only: RDS is explicitly removal-tested; Aurora, DynamoDB
  // and serverless remain exempt from this illustrative structural check.
  for (const n of nodes.filter(n => REMOVAL_TESTED.includes(n.kind) || MANAGED_KINDS.includes(n.kind))) {
    if (MANAGED_KINDS.includes(n.kind)) {
      const runtime = services[n.id];
      const ready = runtime ? runtime.replicas.filter(s => s.state === 'ready' && !s.maintenanceRemaining).length : validateServiceSettings(n.kind, n.settings).settings?.replicas ?? 0;
      if (ready >= 2) continue;
    }
    const remaining = graph(nodes.filter(other => other.id !== n.id), edges.filter(e => e.from !== n.id && e.to !== n.id));
    const workloads = ['web', 'api'].filter(w => (w === 'web' ? hasWeb : hasApi) && !remaining.supports('internet', w));
    if (workloads.length) spofs.push({ nodeId: n.id, name: CATALOG[n.kind].name, workloads, ...(MANAGED_KINDS.includes(n.kind) ? { note: 'Single-replica path loss; reachability only, not capacity or zone resilience.' } : {}) });
  }
  if (nodes.filter(n => ['compute', 'fargate'].includes(n.kind) && reachable.has(n.id)).length === 1) warnings.push('Only one unmanaged compute replica is reachable.');
  if (!hasWeb) warnings.push('No complete static web path to storage.');
  if (!hasApi) warnings.push('No complete API worker-to-database path.');
  return { warnings, spofs, hasWeb, hasApi };
}

export function createRun(scenarioId, nodes, edges) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) throw new RangeError(`Unknown scenario: ${scenarioId}`);
  const copy = nodes.map(cloneNodeSettings);
  if (!copy.some(n => n.id === 'internet')) copy.unshift({ ...ROOT });
  // Historical capacity stress fixtures may start over budget; new managed
  // allocations must always fit the scenario ledger.
  if (copy.some(n => MANAGED_KINDS.includes(n.kind)) && getAllocation(copy) > scenario.budget) throw new RangeError('Credit budget exceeded.');
  return {
    scenarioId, time: 0, duration: scenario.duration, status: 'ready',
    nodes: copy, edges: edges.map(e => ({ ...e })),
    metrics: { arrived: 0, completed: 0, failed: 0, pending: 0, attacksBlocked: 0 },
    availability: { observedSeconds: 0, upSeconds: 0, downtimeSeconds: 0 },
    last: { rps: 0, attackRps: 0, event: null, events: [], edges: {}, nodes: {}, completed: 0, failed: 0 },
    history: [], queues: Object.fromEntries(copy.filter(n => n.kind === 'queue').map(n => [n.id, 0])),
    dropped: {}, failureEvidence: [], _remainder: 0, _outstandingAtFinish: 0,
    nodeHistory: Object.fromEntries(copy.map(n => [n.id, { ...n, name: CATALOG[n.kind]?.name ?? n.id }])),
    edits: [], editsTotal: 0, discardedQueuedWork: 0, outageTargets: {}, outageReplicas: {},
    services: Object.fromEntries(copy.filter(n => MANAGED_KINDS.includes(n.kind)).map(n => [n.id, newService(n.id, validateServiceSettings(n.kind, n.settings).settings, 0, true)])),
    serviceLog: [], serviceLogTotal: 0, managedFailures: 0, replacements: 0, scaleOuts: 0, scaleIns: 0, budgetBlocks: 0,
    nodeRuntime: Object.fromEntries(copy.map(n => [n.id, healthyRuntime()])),
    recoveryLog: [], recoveryLogTotal: 0, shutdowns: 0, reboots: 0,
  };
}

// Validate and prepare everything before committing: failed edits are pure.
export function applyTopology(run, nextNodes, nextEdges) {
  const reject = reason => ({ ok: false, reason });
  if (!['ready', 'running', 'paused'].includes(run.status)) return reject('Round is not editable.');
  if (!Array.isArray(nextNodes) || !Array.isArray(nextEdges)) return reject('Nodes and edges must be arrays.');
  if (nextNodes.length > 30 || nextEdges.length > 100) return reject('Limit is 30 nodes and 100 connections.');
  const ids = new Set();
  const current = new Map(run.nodes.map(n => [n.id, n]));
  for (const n of nextNodes) {
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(n.id) || n.id in Object.prototype || ids.has(n.id)) return reject('Unsafe or duplicate node ID.');
    ids.add(n.id);
    if (typeof n.kind !== 'string' || !Object.hasOwn(ALLOWED, n.kind)) return reject('Unknown service kind.');
    if ((n.id === 'internet') !== (n.kind === 'internet')) return reject('Exactly one internet source is required.');
    if (current.has(n.id) && current.get(n.id).kind !== n.kind) return reject('Existing node kinds cannot change.');
    if (!current.has(n.id) && Object.hasOwn(run.nodeHistory, n.id)) return reject('Removed IDs cannot be reused.');
    const settings = validateServiceSettings(n.kind, n.settings);
    if (!settings.ok) return reject(settings.reason);
  }
  if (!ids.has('internet')) return reject('Exactly one internet source is required.');
  const scenario = SCENARIOS.find(s => s.id === run.scenarioId);
  const services = {};
  for (const n of nextNodes.filter(n => MANAGED_KINDS.includes(n.kind))) {
    const old = run.services[n.id];
    if (old) {
      // Topology-only edits retain actual autoscaled desired and all timers.
      const config = n.settings === undefined ? { ...old.config } : validateServiceSettings(n.kind, n.settings).settings;
      const explicitChange = n.settings !== undefined && Object.keys(config).some(k => config[k] !== old.config[k]);
      const count = explicitChange ? Math.max(config.minReplicas, Math.min(config.maxReplicas, config.replicas !== old.config.replicas ? config.replicas : old.desired)) : old.desired;
      services[n.id] = { ...old, config, replicas: old.replicas.map(s => ({ ...s })) };
      resizeService(services[n.id], n.id, count, run.time);
    } else services[n.id] = newService(n.id, validateServiceSettings(n.kind, n.settings).settings, run.time, false);
  }
  if (getAllocation(nextNodes, services) > scenario.budget) return reject('Credit budget exceeded.');
  const edges = [];
  for (const e of nextEdges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') return reject('Invalid connection.');
    const result = validateEdge(nextNodes, edges, e.from, e.to);
    if (!result.ok) return result;
    edges.push({ from: e.from, to: e.to });
  }
  const nodes = nextNodes.map(n => ({ ...cloneNodeSettings(n), ...(services[n.id] ? { settings: { ...services[n.id].config } } : {}), x: Number.isFinite(n.x) ? n.x : 50, y: Number.isFinite(n.y) ? n.y : 50 }));
  const added = nodes.filter(n => !current.has(n.id)).map(n => n.id);
  const removed = run.nodes.filter(n => !ids.has(n.id)).map(n => n.id);
  const queues = { ...run.queues };
  let discardedQueued = 0;
  for (const id of removed) {
    const pending = queues[id] ?? 0;
    discardedQueued += pending;
    if (pending) run.dropped[id] = (run.dropped[id] ?? 0) + pending;
    delete queues[id];
  }
  for (const n of nodes) if (n.kind === 'queue' && !Object.hasOwn(queues, n.id)) queues[n.id] = 0;
  const key = e => `${e.from}:${e.to}`;
  const oldKeys = new Set(run.edges.map(key));
  const newKeys = new Set(edges.map(key));
  run.edits.push({ at: run.time, added, removed, connectionsAdded: [...newKeys].filter(k => !oldKeys.has(k)).length,
    connectionsRemoved: [...oldKeys].filter(k => !newKeys.has(k)).length, discardedQueued });
  if (run.edits.length > 200) run.edits.splice(0, run.edits.length - 200);
  run.editsTotal++;
  run.discardedQueuedWork += discardedQueued;
  run.metrics.failed += discardedQueued;
  run.metrics.pending = Object.values(queues).reduce((sum, count) => sum + count, 0);
  for (const n of nodes) if (!Object.hasOwn(run.nodeHistory, n.id)) run.nodeHistory[n.id] = { ...n, name: CATALOG[n.kind]?.name ?? n.id };
  run.nodes = nodes;
  run.services = services;
  run.edges = edges;
  run.queues = queues;
  run.nodeRuntime = Object.fromEntries(nodes.map(n => [n.id, run.nodeRuntime[n.id] ?? healthyRuntime()]));
  run.last.nodes = {};
  run.last.edges = {};
  for (const id of Object.keys(run.services)) refreshService(run, id);
  return { ok: true, reason: '' };
}

function tick(run, seconds) {
  const scenario = SCENARIOS.find(s => s.id === run.scenarioId);
  const t = run.time; // Event boundaries align with the fixed tick grid.
  const events = scenario.events.filter(e => t >= e.at && t < e.until);
  const cold = events.find(e => e.type === 'cache');
  const cdnHit = cold?.hitRate ?? 0.8;
  const cacheHit = cold?.hitRate ?? 0.75;
  const demandScale = run.scenarioId !== 'arcade' && [1, 2, 3].includes(run.demandScale) ? run.demandScale : 1;
  const multiplier = events.filter(e => e.type === 'demand').reduce((m, e) => m * e.multiplier, 1);
  const rps = (12 + 53 * (t + seconds / 2) / run.duration) * demandScale * multiplier;
  const attackRps = events.filter(e => e.type === 'attack').reduce((sum, e) => sum + e.attackRps, 0);
  freezeOutageTargets(run, t);
  const outages = events.filter(e => e.type === 'outage').map(event => ({
    event, eventIndex: scenario.events.indexOf(event), nodeId: run.outageTargets[scenario.events.indexOf(event)],
  })).filter(outage => outage.nodeId !== null);
  const downIds = new Set(outages.filter(outage => !run.services[outage.nodeId]).map(outage => outage.nodeId));
  const arcade = run.scenarioId === 'arcade';
  if (arcade) completeReboots(run, t);
  completeServices(run, t);
  const serviceCapacity = id => serviceSnapshot(run, id)?.capacity;
  const offline = id => run.services[id] ? serviceCapacity(id) === 0 : downIds.has(id) || (arcade && ['down', 'rebooting'].includes(run.nodeRuntime[id].state));
  // Time-based uptime is healthy end-to-end path availability, not the fraction
  // of requests served. Insufficient capacity may drop work while paths stay up.
  const healthy = run.nodes.filter(n => !offline(n.id));
  const healthyIds = new Set(healthy.map(n => n.id));
  const healthyGraph = graph(healthy, run.edges.filter(e => healthyIds.has(e.from) && healthyIds.has(e.to)));
  const pathsUp = healthyGraph.supports('internet', 'web') && healthyGraph.supports('internet', 'api');
  const g = graph(run.nodes, run.edges);
  const stats = Object.fromEntries(run.nodes.map(n => [n.id, {
    load: 0, capacity: serviceCapacity(n.id) ?? (offline(n.id) ? 0 : (CATALOG[n.kind]?.capacity ?? 0)),
    utilization: 0, failed: 0, down: offline(n.id), queued: 0, maliciousIn: 0, blocked: 0,
  }]));
  const flows = {};
  const flow = (from, to, count, malicious = false) => {
    if (count <= EPS) return;
    const stat = flows[`${from}:${to}`] ??= { legitimate: 0, malicious: 0 };
    stat[malicious ? 'malicious' : 'legitimate'] += count / seconds;
  };
  const used = Object.fromEntries(run.nodes.map(n => [n.id, 0]));
  let completed = 0;
  let failed = 0;
  const available = id => Math.max(0, stats[id].capacity * seconds - used[id]);
  const drop = (id, count) => {
    if (count <= 0) return;
    failed += count;
    if (stats[id]) stats[id].failed += count;
    run.dropped[id] = (run.dropped[id] ?? 0) + count;
  };
  const take = (node, count, malicious = false) => {
    stats[node.id].load += count / seconds;
    const served = Math.min(count, available(node.id));
    used[node.id] += served;
    if (!malicious) drop(node.id, count - served);
    return served;
  };
  const split = (children, count, fn, owner) => {
    if (!children.length) { drop(owner, count); return; }
    children.forEach(child => fn(child, count / children.length));
  };
  // Routing is split at every fork, never multicast. Live replicas receive equal
  // shares; capacity is a single shared ledger, so earlier branches can claim
  // shared resources first. This is approximate fairness, not a queueing solver.
  const live = children => {
    const up = children.filter(n => !offline(n.id));
    return up.length ? up : children;
  };
  const servingChildren = node => live(g.children(node.id).filter(n => SERVING.includes(n.kind)));
  const forwardAttack = (node, children, count) => children.forEach(n => {
    flow(node.id, n.id, count / children.length, true);
    attack(n, count / children.length);
  });
  const attack = (node, count) => {
    if (count <= EPS) return;
    stats[node.id].maliciousIn += count / seconds;
    if (node.kind === 'internet') {
      const children = servingChildren(node);
      forwardAttack(node, children, count);
      return;
    }
    if (node.kind === 'shield') {
      const blocked = take(node, count, true);
      run.metrics.attacksBlocked += blocked;
      stats[node.id].blocked += blocked / seconds;
      const children = servingChildren(node);
      forwardAttack(node, children, count - blocked);
      return;
    }
    const served = take(node, count, true);
    if (WORKERS.includes(node.kind)) return;
    // Edge overload also discards attack traffic, but only the shield earns
    // blocked credit. A CDN forwards malicious requests to exposed workers.
    const children = servingChildren(node);
    forwardAttack(node, children, served);
  };
  const route = (node, count, workload) => {
    if (count <= EPS) return;
    if (node.kind === 'internet') {
      stats[node.id].load += count / seconds;
    } else count = take(node, count);
    if (count <= EPS) return;
    if (node.kind === 'storage' && workload === 'web' || DATABASES.includes(node.kind) && workload === 'api') {
      completed += count;
      return;
    }
    if (node.kind === 'cdn' && workload === 'web') {
      const origins = live(g.children(node.id).filter(n => n.kind === 'storage'));
      if (!origins.length) { drop(node.id, count); return; }
      completed += count * cdnHit;
      // Each origin receives only its fraction of misses.
      origins.forEach(n => { const misses = count * (1 - cdnHit) / origins.length; flow(node.id, n.id, misses); route(n, misses, workload); });
      return;
    }
    if (node.kind === 'cache' && workload === 'api') {
      const databases = live(g.children(node.id).filter(n => DATABASES.includes(n.kind)));
      if (!databases.length) { drop(node.id, count); return; }
      completed += count * cacheHit;
      databases.forEach(n => { const misses = count * (1 - cacheHit) / databases.length; flow(node.id, n.id, misses); route(n, misses, workload); });
      return;
    }
    if (node.kind === 'queue' && workload === 'api') {
      if (!g.supports(node.id, 'api')) { drop(node.id, count); return; }
      const room = CATALOG.queue.capacity * 5 - (run.queues[node.id] ?? 0);
      const accepted = Math.min(count, Math.max(0, room));
      run.queues[node.id] = (run.queues[node.id] ?? 0) + accepted;
      drop(node.id, count - accepted);
      return;
    }
    let children;
    if (workload === 'web') children = g.children(node.id).filter(n => ['shield', 'cdn'].includes(n.kind));
    else if (CONSUMERS.includes(node.kind)) children = g.children(node.id).filter(n => [...DATABASES, 'cache', 'queue'].includes(n.kind));
    else if (node.kind === 'apigw') children = g.children(node.id).filter(n => [...WORKERS, 'alb', 'queue'].includes(n.kind));
    else children = servingChildren(node);
    children = live(children);
    split(children, count, child => { flow(node.id, child.id, count / children.length); route(child, count / children.length, workload); }, node.id);
  };

  // Queued work is reserved atomically along a consumer/data path. Work that
  // cannot fit stays pending without retries or partial upstream execution.
  // Cache demand uses expected miss fractions; conservative head-of-line
  // blocking can occur when its database is saturated. Nested queues stage work.
  const plans = (node, path = []) => {
    if (offline(node.id)) return [];
    const next = [...path, { id: node.id, factor: 1 }];
    if (DATABASES.includes(node.kind)) return [{ path: next, destination: null }];
    if (node.kind === 'queue') return g.supports(node.id, 'api') ? [{ path: next, destination: node.id }] : [];
    if (node.kind === 'cache') return g.children(node.id).filter(n => DATABASES.includes(n.kind) && !offline(n.id)).map(n => ({ path: [...next, { id: n.id, factor: 1 - cacheHit }], destination: null }));
    return g.children(node.id).flatMap(n => plans(n, next));
  };

  const root = g.byId.get('internet');
  if (root) attack(root, attackRps * seconds);
  const initialQueues = { ...run.queues };
  for (const node of run.nodes.filter(n => n.kind === 'queue')) {
    const routes = g.children(node.id).flatMap(n => plans(n));
    const budget = Math.min(initialQueues[node.id] ?? 0, CATALOG.queue.capacity * seconds);
    for (const plan of routes) {
      let count = budget / routes.length;
      for (const part of plan.path) count = Math.min(count, available(part.id) / part.factor);
      if (plan.destination) count = Math.min(count, CATALOG.queue.capacity * 5 - run.queues[plan.destination]);
      count = Math.max(0, count);
      let previous = node.id;
      for (const part of plan.path) {
        used[part.id] += count * part.factor;
        stats[part.id].load += count * part.factor / seconds;
        flow(previous, part.id, count * part.factor);
        previous = part.id;
      }
      run.queues[node.id] -= count;
      if (plan.destination) run.queues[plan.destination] += count;
      else completed += count;
    }
  }
  const arrivals = rps * seconds;
  if (root) {
    route(root, arrivals * 0.6, 'web');
    route(root, arrivals * 0.4, 'api');
  } else drop('internet', arrivals);
  run.availability.observedSeconds += seconds;
  if (pathsUp) run.availability.upSeconds += seconds;
  else run.availability.downtimeSeconds += seconds;
  run.time = Math.min(run.duration, run.time + seconds);
  // Freeze on arrival at the boundary, before callers can edit that topology.
  freezeOutageTargets(run, run.time);
  run.metrics.arrived += arrivals;
  let pending = Object.values(run.queues).reduce((sum, count) => sum + count, 0);
  if (run.time >= run.duration - EPS) {
    run.time = run.duration;
    run._outstandingAtFinish = pending;
    for (const [id, count] of Object.entries(run.queues)) {
      drop(id, count);
      run.queues[id] = 0;
    }
    pending = 0;
    run.status = 'finished';
  }
  run.metrics.completed += completed;
  run.metrics.failed += failed;
  run.metrics.pending = pending;
  // Roundoff only (all actual failures are attributed above).
  const error = run.metrics.arrived - run.metrics.completed - run.metrics.failed - pending;
  if (Math.abs(error) < 1e-7) run.metrics.completed += error;
  for (const [id, stat] of Object.entries(stats)) {
    stat.utilization = stat.capacity ? stat.load / stat.capacity : (stat.load ? 1 : 0);
    stat.queued = run.queues[id] ?? 0;
  }
  if (arcade) {
    for (const node of run.nodes) {
      if (run.services[node.id]) continue;
      const runtime = run.nodeRuntime[node.id];
      const entry = CATALOG[node.kind];
      // Only serving attempts accrue strain. Capacity zero due to downtime is
      // not itself overload; queued reservations are work actually dispatched.
      if (offline(node.id)) {
        if (downIds.has(node.id) && ['healthy', 'overloaded'].includes(runtime.state)) {
          runtime.state = 'healthy';
          runtime.overloadS = 0;
        }
        continue;
      }
      if (!entry?.overloadMode) continue;
      const overloaded = stats[node.id].load > entry.capacity * 1.05 + EPS;
      runtime.overloadS = overloaded ? runtime.overloadS + seconds : 0;
      runtime.state = overloaded ? 'overloaded' : 'healthy';
      if (entry.overloadMode === 'shutdown' && runtime.overloadS >= entry.overloadToleranceS - EPS) {
        runtime.state = 'down';
        runtime.shutdowns++;
        run.shutdowns++;
        recoveryEvent(run, node.id, 'shutdown');
      }
    }
    completeReboots(run, run.time);
    for (const node of run.nodes) {
      if (run.services[node.id]) continue;
      const runtime = run.nodeRuntime[node.id];
      const stat = stats[node.id];
      const maintenance = maintenanceRemaining(run, node.id, run.time);
      stat.state = maintenance ? 'maintenance' : runtime.state === 'overloaded' && CATALOG[node.kind]?.overloadMode === 'throttle' ? 'throttled' : runtime.state;
      stat.overloadS = runtime.overloadS;
      stat.rebootRemaining = runtime.state === 'rebooting' ? Math.max(0, runtime.recoverAt - run.time) : 0;
      stat.maintenanceRemaining = maintenance;
      stat.down = maintenance > 0 || ['down', 'rebooting'].includes(runtime.state);
      stat.capacity = stat.down ? 0 : (CATALOG[node.kind]?.capacity ?? 0);
    }
  }
  for (const { event, eventIndex, nodeId } of outages) {
    let evidence = run.failureEvidence.find(e => e.nodeId === nodeId && e.eventIndex === eventIndex);
    if (!evidence) {
      evidence = { nodeId, eventIndex, ...(run.outageReplicas[eventIndex] ? { replicaId: run.outageReplicas[eventIndex] } : {}), label: event.label, at: t, until: t, arrived: 0, completed: 0, failed: 0 };
      run.failureEvidence.push(evidence);
    }
    evidence.until = run.time;
    evidence.arrived += arrivals;
    evidence.completed += completed;
    evidence.failed += failed;
  }
  // events are detached event objects; event is the legacy joined-label view.
  run.last = { rps, attackRps, cdnHit, cacheHit, events: events.map(e => ({ ...e, ...(e.targetKinds ? { targetKinds: [...e.targetKinds] } : {}) })),
    event: events.length ? events.map(e => e.label).join(' + ') : null, nodes: stats, edges: flows, completed, failed };
  completeServices(run, run.time);
  if (run.status !== 'finished') scaleServices(run, seconds, CATALOG, scenario.budget, id => serviceSnapshot(run, id).maintenance,
    id => run.nodes.filter(n => n.kind === 'queue' && g.children(n.id).some(child => child.id === id)).map(n => n.id));
  for (const id of Object.keys(run.services)) refreshService(run, id);
  run.history.push({ time: run.time, success: run.metrics.arrived ? run.metrics.completed / run.metrics.arrived : 0, rps, event: run.last.event });
  if (run.history.length > 1200) run.history.splice(0, run.history.length - 1200);
}

export function stepRun(run, dt = TICK) {
  if (run.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return run;
  // Accumulate sub-tick calls; cap a single UI catch-up at five seconds.
  run._remainder += Math.min(dt, 5);
  while (run._remainder >= TICK - EPS && run.time < run.duration && run.status === 'running') {
    run._remainder = Math.max(0, run._remainder - TICK);
    tick(run, Math.min(TICK, run.duration - run.time));
  }
  if (run.status === 'finished') run._remainder = 0;
  return run;
}

export function summarizeRun(run) {
  const topology = analyzeTopology(run.nodes, run.edges, Object.fromEntries(Object.keys(run.services).map(id => [id, serviceSnapshot(run, id)])));
  const success = run.metrics.arrived ? Math.max(0, Math.min(1, run.metrics.completed / run.metrics.arrived)) : 0;
  // A requires both workloads, >=98% completion, and no modeled path SPOFs.
  // A numerically excellent but structurally incomplete/fragile design caps at B.
  const grade = !run.metrics.arrived ? 'F' : success >= 0.98 && !topology.spofs.length && topology.hasWeb && topology.hasApi ? 'A'
    : success >= 0.9 ? 'B' : success >= 0.75 ? 'C' : success >= 0.5 ? 'D' : 'F';
  const eligible = run.nodes.some(n => [...REMOVAL_TESTED, ...MANAGED_KINDS].includes(n.kind));
  const resilience = !run.metrics.arrived || !eligible ? 'Not tested' : topology.spofs.length ? 'Single-node path loss detected' : 'No modeled single-node path loss';
  const notes = [
    'Reachability only: removes virtual machines, app containers, cache nodes, SQL database nodes or one managed replica; other managed profiles and event functions are exempt. This is no cloud availability guarantee.',
    'Capacity sharing and illustrative autoscale are deterministic game models; retries, latency and real cloud billing are excluded.',
    ...topology.warnings,
  ];
  const outstanding = run.status === 'finished' ? run._outstandingAtFinish : run.metrics.pending;
  notes.push(`Topology edits: ${run.editsTotal}; discarded queued work: ${run.discardedQueuedWork.toFixed(2)} requests failed on deletion.`);
  notes.push(`Overload shutdowns: ${run.shutdowns}; manual reboots started: ${run.reboots}.`);
  notes.push(`Outstanding queued work: ${outstanding.toFixed(2)} requests${run.status === 'finished' ? ' failed at round end' : ' still pending'}.`);
  for (const evidence of run.failureEvidence) notes.push(`Actual instance outage: ${evidence.nodeId}, ${evidence.at}–${evidence.until}s; ${evidence.completed.toFixed(2)} completed and ${evidence.failed.toFixed(2)} failed during the event.`);
  if (!run.metrics.arrived) notes.push('No traffic: success and resilience have not been tested.');
  const uptime = run.availability.observedSeconds ? run.availability.upSeconds / run.availability.observedSeconds : null;
  return { grade, success, resilience, uptime, availability: { ...run.availability }, bottlenecks: Object.entries(run.dropped).filter(([, dropped]) => dropped > EPS)
    .map(([id, dropped]) => ({ id, name: run.nodeHistory[id]?.name ?? id, dropped }))
    .sort((a, b) => b.dropped - a.dropped), notes, topology, failureEvidence: run.failureEvidence.map(e => ({ ...e })),
    outstandingQueued: outstanding, outstandingAtFinish: run._outstandingAtFinish, editsTotal: run.editsTotal, discardedQueuedWork: run.discardedQueuedWork,
    shutdowns: run.shutdowns, reboots: run.reboots, managedFailures: run.managedFailures, replacements: run.replacements, scaleOuts: run.scaleOuts, scaleIns: run.scaleIns, budgetBlocks: run.budgetBlocks,
    services: Object.fromEntries(Object.keys(run.services).map(id => [id, serviceSnapshot(run, id)])) };
}

export function starterTopology(mode = 'balanced') {
  if (mode === 'empty') return { nodes: [{ ...ROOT }], edges: [] };
  if (['managed', 'queued'].includes(mode)) {
    const queued = mode === 'queued';
    const nodes = [{ ...ROOT }, { id: 'shield', kind: 'shield', x: 18, y: 50 }, { id: 'cdn', kind: 'cdn', x: 30, y: 50 }, { id: 'storage', kind: 'storage', x: 45, y: 20 },
      { id: queued ? 'apigw' : 'alb', kind: queued ? 'apigw' : 'alb', x: 43, y: 60 }, ...(queued ? [{ id: 'queue', kind: 'queue', x: 56, y: 60 }] : []),
      { id: queued ? 'workers' : 'containers', kind: queued ? 'queueworker' : 'containers', x: 70, y: 60, settings: { replicas: queued ? 1 : 2, minReplicas: queued ? 1 : 2, maxReplicas: 3, autoScale: true, targetUtilization: 0.7, backlogSeconds: 2 } }, { id: 'database', kind: 'database', x: 87, y: 60 }];
    const path = ['internet', 'shield', 'cdn', queued ? 'apigw' : 'alb', ...(queued ? ['queue'] : []), queued ? 'workers' : 'containers', 'database'];
    return { nodes, edges: [...path.slice(1).map((to, i) => ({ from: path[i], to })), { from: 'cdn', to: 'storage' }] };
  }
  if (!['balanced', 'fragile'].includes(mode)) throw new RangeError(`Unknown starter mode: ${mode}`);
  const nodes = [{ ...ROOT },
    { id: 'shield', kind: 'shield', x: 20, y: 50 },
    { id: 'cdn', kind: 'cdn', x: 34, y: 50 },
    { id: 'storage', kind: 'storage', x: 52, y: 22 },
    { id: 'alb', kind: 'alb', x: 49, y: 58 },
    { id: 'compute-1', kind: 'compute', x: 66, y: 45 },
    ...(mode === 'balanced' ? [{ id: 'compute-2', kind: 'compute', x: 66, y: 75 }] : []),
    { id: 'database', kind: 'database', x: 86, y: 58 },
  ];
  const edges = [{ from: 'internet', to: 'shield' }, { from: 'shield', to: 'cdn' },
    { from: 'cdn', to: 'storage' }, { from: 'cdn', to: 'alb' }];
  for (const n of nodes.filter(n => n.kind === 'compute')) edges.push({ from: 'alb', to: n.id }, { from: n.id, to: 'database' });
  return { nodes, edges };
}
