// Illustrative failure domains and execution cohorts, not a deployment scheduler.
export const ZONAL_KINDS = ['compute', 'fargate', 'rds', 'cache', 'containers', 'queueworker'];
const managed = ['containers', 'queueworker'];
const workers = ['compute', 'fargate', 'serverless', ...managed];
const data = ['database', 'rds', 'aurora', 'cache'];
export const nodeZone = node => ZONAL_KINDS.includes(node?.kind) ? node.zone ?? 'A' : null;
export const zoneRemaining = (run, zone, time = run.time) => run.scenarioId === 'arcade' && zone === 'A' && time >= 10 && time < 18 ? 18 - time : 0;

export function validateResilience(nodes) {
  const reject = reason => ({ ok: false, reason });
  if (!Array.isArray(nodes)) return reject('Nodes must be an array.');
  const byId = new Map(nodes.map(n => [n?.id, n]));
  for (const node of nodes) {
    if (!node || typeof node !== 'object') return reject('Invalid node.');
    for (const key of ['zone', 'requiredDependencyIds']) {
      if (key in node) {
        const d = Object.getOwnPropertyDescriptor(node, key);
        if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) return reject('Unsafe resilience metadata.');
      }
    }
    if (Object.hasOwn(node, 'zone') && (!ZONAL_KINDS.includes(node.kind) || !['A', 'B', ...(managed.includes(node.kind) ? ['spread'] : [])].includes(node.zone))) return reject('Invalid zone placement.');
    if (!Object.hasOwn(node, 'requiredDependencyIds')) continue;
    const ids = node.requiredDependencyIds;
    if (!workers.includes(node.kind) || !Array.isArray(ids) || ids.length > 4) return reject('Requirements need a worker and at most four dependency IDs.');
    // Inspect descriptors before reading array values: imports may carry accessors.
    if (Reflect.ownKeys(ids).some(k => k !== 'length' && (!/^(0|[1-9]\d*)$/.test(String(k)) || !Object.hasOwn(Object.getOwnPropertyDescriptor(ids, k), 'value')))) return reject('Unsafe dependency array.');
    if (Array.from(ids).some(id => typeof id !== 'string' || !data.includes(byId.get(id)?.kind)) || new Set(ids).size !== ids.length) return reject('Requirements must name unique existing data/cache nodes.');
  }
  return { ok: true, reason: '' };
}

export function cloneResilienceNode(node) {
  return { ...node, ...(node.requiredDependencyIds !== undefined ? { requiredDependencyIds: [...node.requiredDependencyIds] } : {}) };
}

export function initializeResilience(run) {
  run.checkout = { arrived: 0, succeeded: 0, failed: 0, pending: 0, infrastructureFailed: 0, dependencyFailed: 0, businessFailed: 0 };
  run.staticSucceeded = 0;
  const version = () => ({ attempted: 0, succeeded: 0, businessFailed: 0 });
  run.release = { phase: 'pending', share: 0, automatic: true, versions: { stable: version(), new: version() } };
  run.resilienceLog = []; run.resilienceLogTotal = 0; run.requirementsChanged = 0;
  run.resilienceEvidence = { dependencies: [], blockedQueues: [], dependenciesOmitted: 0, dependencyCountOmitted: 0, blockedQueuesOmitted: 0, blockedQueueObservedSecondsOmitted: 0, blockedQueueMaxPendingOmitted: 0 };
  run._resilienceBoundaries = [];
  return run;
}

export function resilienceEvent(run, type, extra = {}) {
  run.resilienceLog.push({ at: run.time, type, ...structuredClone(extra) });
  run.resilienceLogTotal++;
  if (run.resilienceLog.length > 200) run.resilienceLog.splice(0, run.resilienceLog.length - 200);
}

export function resilienceBoundary(run) {
  if (run.scenarioId !== 'arcade') return;
  for (const [at, type, share] of [[10, 'zone-start'], [18, 'zone-end'], [85, 'release-promotion', .1], [90, 'release-promotion', .25], [95, 'release-promotion', .5]]) {
    if (run.time < at || run._resilienceBoundaries.includes(at)) continue;
    run._resilienceBoundaries.push(at);
    if (share !== undefined) {
      if (!run.release.automatic) continue;
      run.release.share = share; run.release.phase = 'promoting';
    }
    resilienceEvent(run, type, { at, ...(share === undefined ? { zone: 'A' } : { share }) });
  }
}

export function configureRelease(run, changes) {
  const reject = reason => ({ ok: false, reason });
  if (run.scenarioId !== 'arcade' || run.time < 85 || !['running', 'paused'].includes(run.status)) return reject('Release controls are available during the live release only.');
  if (!changes || typeof changes !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(changes)) || Reflect.ownKeys(changes).some(k => {
    const d = Object.getOwnPropertyDescriptor(changes, k);
    return !['action', 'share'].includes(k) || !Object.hasOwn(d, 'value') || !d.enumerable;
  })) return reject('Unsafe release command.');
  const { action, share } = changes;
  if (!Object.hasOwn(changes, 'action') || !['pause', 'shift', 'rollback'].includes(action) || (action !== 'shift' && Object.hasOwn(changes, 'share'))) return reject('Invalid release command.');
  const release = run.release;
  if (release.phase === 'rolled-back' && action !== 'rollback') return reject('Release has been rolled back.');
  if (action === 'shift' && (!Number.isFinite(share) || ![0, .1, .25, .5].includes(share) || share > release.share)) return reject('Share must be supported and cannot increase.');
  release.automatic = false;
  if (action === 'rollback') { release.share = 0; release.phase = 'rolled-back'; }
  else { if (action === 'shift') release.share = share; release.phase = 'paused'; }
  resilienceEvent(run, 'release-control', { action, share: release.share });
  return { ok: true, reason: '' };
}

export function terminalCheckout(run, count) {
  const share = run.scenarioId === 'arcade' ? run.release.share : 0;
  const fresh = count * share, businessFailed = fresh * .4;
  for (const [name, attempted, failed] of [['stable', count - fresh, 0], ['new', fresh, businessFailed]]) {
    const v = run.release.versions[name]; v.attempted += attempted; v.succeeded += attempted - failed; v.businessFailed += failed;
  }
  run.checkout.succeeded += count - businessFailed;
  run.checkout.failed += businessFailed; run.checkout.businessFailed += businessFailed;
  return { succeeded: count - businessFailed, failed: businessFailed };
}

export function dependencyEvidence(run, workerId, blocked, count) {
  for (const { dependencyId, zone, reason } of blocked) {
    const evidence = run.resilienceEvidence;
    let item = evidence.dependencies.find(e => e.workerId === workerId && e.dependencyId === dependencyId && e.zone === zone && e.reason === reason);
    if (!item && evidence.dependencies.length < 64) {
      item = { workerId, dependencyId, zone, reason, count: 0, firstAt: run.time, lastAt: run.time }; evidence.dependencies.push(item);
    }
    if (item) { item.count += count; item.lastAt = run.time; }
    else { evidence.dependenciesOmitted++; evidence.dependencyCountOmitted += count; }
  }
}

export function blockedQueueEvidence(run, queueId, workerId, blocked, pending, seconds) {
  for (const { dependencyId, zone, reason } of blocked) {
    const evidence = run.resilienceEvidence;
    let item = evidence.blockedQueues.find(e => e.queueId === queueId && e.workerId === workerId && e.dependencyId === dependencyId && e.zone === zone && e.reason === reason);
    if (!item && evidence.blockedQueues.length < 64) {
      item = { queueId, workerId, dependencyId, zone, reason, maxPending: 0, observedSeconds: 0, firstAt: run.time, lastAt: run.time }; evidence.blockedQueues.push(item);
    }
    if (item) { item.maxPending = Math.max(item.maxPending, pending); item.observedSeconds += seconds; item.lastAt = run.time; }
    else { evidence.blockedQueuesOmitted++; evidence.blockedQueueObservedSecondsOmitted += seconds; evidence.blockedQueueMaxPendingOmitted = Math.max(evidence.blockedQueueMaxPendingOmitted, pending); }
  }
}

export function resilienceSnapshot(run) {
  return structuredClone({ zoneIncident: { active: !!zoneRemaining(run, 'A'), zone: 'A', until: 18 }, checkout: run.checkout, staticSucceeded: run.staticSucceeded,
    release: run.release, events: run.resilienceLog, eventsTotal: run.resilienceLogTotal, requirementsChanged: run.requirementsChanged, evidence: run.resilienceEvidence });
}
