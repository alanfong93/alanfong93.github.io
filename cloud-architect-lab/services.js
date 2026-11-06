// Illustrative reserved-slot allocation, not cloud billing or provider guarantees.
export const MANAGED_KINDS = ['containers', 'queueworker'];
const defaults = { replicas: 1, autoScale: false, minReplicas: 1, maxReplicas: 6, targetUtilization: 0.7, backlogSeconds: 2 };
export function validateServiceSettings(kind, value) {
  const reject = reason => ({ ok: false, reason, settings: null });
  if (!MANAGED_KINDS.includes(kind)) return value === undefined ? { ok: true, reason: '', settings: undefined } : reject('Settings require a managed service.');
  if (value === undefined) return { ok: true, reason: '', settings: { ...defaults } };
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return reject('Settings must be a plain object.');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(defaults, key) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return reject('Unknown or unsafe setting.');
  }
  const settings = { ...defaults, ...value };
  for (const key of ['replicas', 'minReplicas', 'maxReplicas']) if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 6) return reject('Replica counts must be integers from 1 to 6.');
  if (settings.minReplicas > settings.replicas || settings.replicas > settings.maxReplicas) return reject('Require minReplicas ≤ replicas ≤ maxReplicas.');
  if (typeof settings.autoScale !== 'boolean') return reject('autoScale must be boolean.');
  if (!Number.isFinite(settings.targetUtilization) || settings.targetUtilization < 0.5 || settings.targetUtilization > 0.9) return reject('Target utilization must be 0.5–0.9.');
  if (!Number.isFinite(settings.backlogSeconds) || settings.backlogSeconds < 1 || settings.backlogSeconds > 4) return reject('Backlog seconds must be 1–4.');
  return { ok: true, reason: '', settings };
}

export function allocation(nodes, services, catalog) {
  let total = 0;
  for (const node of nodes) {
    const result = validateServiceSettings(node.kind, node.settings);
    if (!result.ok) return Infinity;
    total += (catalog[node.kind]?.cost ?? 0) * (MANAGED_KINDS.includes(node.kind) ? services?.[node.id]?.replicas.length ?? result.settings.replicas : 1);
  }
  return total;
}

export function newService(id, config, time, ready) {
  const service = { replicas: [], desired: 0, nextReplicaId: 1, config: { ...config }, highFor: 0, lowFor: 0, cooldownUntil: 0, blockedReason: '', metric: null };
  resizeService(service, id, config.replicas, time, ready);
  return service;
}

export function resizeService(service, id, count, time, ready = false) {
  while (service.replicas.length < count) service.replicas.push({ id: `${id}-replica-${service.nextReplicaId++}`, state: ready ? 'ready' : 'starting', readyAt: ready ? time : time + 3 });
  // Retire newest slots first. Frozen outage identities never transfer.
  service.replicas.splice(count);
  service.desired = service.replicas.length;
}

export function serviceEvent(run, nodeId, type, extra = {}) {
  run.serviceLog.push({ at: run.time, nodeId, type, ...extra });
  run.serviceLogTotal++;
  if (run.serviceLog.length > 200) run.serviceLog.splice(0, run.serviceLog.length - 200);
}

export function slotMaintenance(run, id, slotId, time, events) {
  let remaining = 0;
  for (const [index, event] of events.entries()) {
    if (event.type === 'outage' && time >= event.at && time < event.until && run.outageTargets[index] === id && run.outageReplicas[index] === slotId) remaining = Math.max(remaining, event.until - time);
  }
  return remaining;
}

export function snapshot(run, id, events, catalog) {
  const service = run.services[id];
  if (!service) return null;
  const slots = service.replicas.map(slot => ({ ...slot, maintenanceRemaining: slotMaintenance(run, id, slot.id, run.time, events) }));
  const ready = slots.filter(slot => slot.state === 'ready' && !slot.maintenanceRemaining).length;
  const starting = slots.filter(slot => slot.state === 'starting').length;
  const replacing = slots.filter(slot => slot.state === 'replacing').length;
  const maintenance = slots.filter(slot => slot.maintenanceRemaining > 0).length;
  const capacity = ready * 22;
  const load = run.last.nodes[id]?.load ?? 0;
  const status = !ready ? replacing ? 'recovering' : starting ? 'starting' : 'degraded' : load > capacity + 1e-9 ? 'throttled' : ready < service.desired ? 'degraded' : 'healthy';
  return { desired: service.desired, ready, starting, replacing, maintenance, capacity, config: { ...service.config }, allocation: service.desired * catalog[run.nodes.find(n => n.id === id).kind].cost, blockedReason: service.blockedReason, status, metric: service.metric ? { ...service.metric } : null, replicas: slots, highFor: service.highFor, lowFor: service.lowFor, cooldownUntil: service.cooldownUntil };
}

export function completeServices(run, time) {
  for (const [id, service] of Object.entries(run.services)) for (const slot of service.replicas) {
    if (slot.state === 'ready' || slot.readyAt > time + 1e-9) continue;
    if (slot.state === 'replacing') { run.replacements++; serviceEvent(run, id, 'replica-replaced', { replicaId: slot.id }); }
    slot.state = 'ready';
  }
}

export function scaleServices(run, seconds, catalog, budget, maintenanceCount, incomingQueues) {
  for (const node of run.nodes.filter(n => MANAGED_KINDS.includes(n.kind))) {
    const service = run.services[node.id], config = service.config;
    const backlog = incomingQueues(node.id).reduce((sum, id) => sum + (run.queues[id] ?? 0), 0);
    const demand = run.last.nodes[node.id]?.load ?? 0;
    const raw = node.kind === 'queueworker' ? Math.ceil(backlog / (22 * config.backlogSeconds)) : Math.ceil(demand / (22 * config.targetUtilization));
    const requested = raw + maintenanceCount(node.id);
    const target = Math.max(config.minReplicas, Math.min(config.maxReplicas, requested));
    service.metric = node.kind === 'queueworker' ? { type: 'backlog', value: backlog, targetPerReplica: 22 * config.backlogSeconds, target } : { type: 'attempted-rps', value: demand, targetPerReplica: 22 * config.targetUtilization, target };
    if (!config.autoScale) { service.highFor = service.lowFor = 0; service.blockedReason = ''; continue; }
    service.highFor = target > service.desired ? service.highFor + seconds : 0;
    service.lowFor = target < service.desired ? service.lowFor + seconds : 0;
    const previous = service.blockedReason;
    service.blockedReason = requested > config.maxReplicas && service.desired >= config.maxReplicas ? 'max' : '';
    if (service.highFor >= 2 - 1e-9 && run.time >= service.cooldownUntil) {
      if (allocation(run.nodes, run.services, catalog) + catalog[node.kind].cost > budget) {
        service.blockedReason = 'budget';
        if (previous !== 'budget') { run.budgetBlocks++; serviceEvent(run, node.id, 'budget-blocked'); }
      } else {
        resizeService(service, node.id, service.desired + 1, run.time);
        run.scaleOuts++; serviceEvent(run, node.id, 'scale-out', { desired: service.desired });
        service.highFor = service.lowFor = 0; service.cooldownUntil = run.time + 4;
      }
    } else if (service.lowFor >= 8 - 1e-9 && run.time >= service.cooldownUntil && service.replicas.every(slot => slot.state === 'ready')) {
      resizeService(service, node.id, service.desired - 1, run.time);
      run.scaleIns++; serviceEvent(run, node.id, 'scale-in', { desired: service.desired });
      service.highFor = service.lowFor = 0; service.cooldownUntil = run.time + 4;
    } else if (previous === 'budget' && target > service.desired) service.blockedReason = 'budget';
  }
}
