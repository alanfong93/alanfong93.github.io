import { validateEdge } from './engine.js';

export const CATALOG_GROUPS = [
  { name: 'Compute', kinds: ['compute', 'fargate', 'serverless', 'containers', 'queueworker'] },
  { name: 'Edge & Networking', kinds: ['alb', 'apigw', 'cdn'] },
  { name: 'Storage', kinds: ['storage'] },
  { name: 'Databases', kinds: ['aurora', 'database', 'rds', 'cache'] },
  { name: 'Security', kinds: ['shield'] },
  { name: 'Integration', kinds: ['queue'] },
];

// Unobserved or pending work and advisory text are not painted green.
export function buildAssessments(run, result) {
  const count = n => Math.round(n).toLocaleString();
  const findings = [];
  const hasPaths = result.topology.hasWeb && result.topology.hasApi;
  if (!hasPaths) findings.push({ title: 'Required workload paths', outcome: 'fail', text: 'The final design is missing a complete web or API path. A lack of detected single points of failure does not make an incomplete design resilient.' });
  else if (result.topology.spofs.length) findings.push({ title: 'Path redundancy check', outcome: 'fail', text: result.topology.spofs.map(s => `Removing ${s.nodeId} loses the ${s.workloads.join(' and ')} path.`).join(' ') + ' Add independent paths and test spare capacity. An otherwise A result is capped at B.' });
  else findings.push({ title: 'Path redundancy check', outcome: result.resilience === 'Not tested' ? 'info' : 'pass', text: `${result.resilience}. Checks remove operator-managed compute, SQL and cache nodes, or one ready managed replica. Other managed profiles are exempt from this check, not failure-proof.` });
  const a = result.availability;
  findings.push({ title: 'Uptime', outcome: !a?.observedSeconds ? 'info' : a.downtimeSeconds > 0 ? 'fail' : 'pass', text: a?.observedSeconds ? `${(result.uptime * 100).toFixed(1)}% path availability; ${a.downtimeSeconds.toFixed(1)}s downtime in ${a.observedSeconds.toFixed(1)}s observed. Both web and API must have healthy end-to-end paths. This differs from request success under load.` : 'No simulation time observed; uptime is not yet measured.' });
  for (const b of result.bottlenecks.slice(0, 3)) findings.push({ title: `${b.name} · ${b.id}`, outcome: 'fail', text: `${count(b.dropped)} failed requests attributed here. ${b.id === 'internet' ? 'Connect both workload paths from the Internet.' : 'Inspect its demand, connected dependencies and available capacity.'}` });
  if (!result.bottlenecks.length && run.metrics.arrived > 0) findings.push({ title: 'Request delivery', outcome: run.metrics.pending ? 'info' : 'pass', text: run.metrics.pending ? 'No failures recorded, but queued work is still pending.' : 'No failed customer requests recorded in this round.' });
  for (const e of result.failureEvidence) {
    const outcome = e.failed > 1e-7 ? 'fail' : e.arrived > 0 && e.completed >= e.arrived - 1e-7 ? 'pass' : 'info';
    findings.push({ title: e.label ?? 'Outage window', outcome, text: `${e.replicaId ? `One replica (${e.replicaId}) of ${e.nodeId}` : e.nodeId} was unavailable from ${e.at.toFixed(0)}–${e.until.toFixed(0)}s.${e.replicaId ? ' Other ready replicas could still serve.' : ''} The system-wide window observed ${count(e.completed)} completions and ${count(e.failed)} failures. ${outcome === 'info' ? 'Completion is not established by these window totals. ' : ''}Overlapping windows are not additive; failures are not automatically caused by this one node.` });
  }
  if (result.outstandingAtFinish > 0 || result.discardedQueuedWork > 0) findings.push({ title: 'Accepted is not completed', outcome: 'fail', text: `${count(result.outstandingAtFinish)} requests remained queued at the end; ${count(result.discardedQueuedWork)} were lost when queues were deleted. Both count as failures.` });
  findings.push({ title: 'Live operations', outcome: !hasPaths || !run.metrics.arrived ? 'info' : result.shutdowns || result.discardedQueuedWork ? 'fail' : 'pass', text: `${result.editsTotal} topology edits, ${result.shutdowns} overload shutdowns and ${result.reboots} manual reboots. This check requires complete workload paths and flags shutdowns or deleted queued work; earlier failures remain in cumulative totals even after a repair.` });
  if (Object.keys(run.services ?? {}).length) findings.push({ title: 'Managed replica lifecycle', outcome: 'info', text: `${run.managedFailures} injected replica failures, ${run.replacements} completed replacements, ${run.scaleOuts} scale-outs, ${run.scaleIns} scale-ins and ${run.budgetBlocks} budget blocks. Replacement restores an existing slot; scaling changes reserved allocation. These counters alone do not establish successful request delivery.` });
  findings.push({ title: 'Next experiment', outcome: 'info', text: 'Try changing capacity before Black Friday, testing a managed replica failure, rebooting operator-managed nodes, or wiring around maintenance. Compare one change at a time.' });
  return findings;
}

// Every node activation participates in the same two-click gesture, whether it
// came from a mouse, touch or keyboard. A drag never calls this function.
export function connectionClick(nodes, edges, source, target) {
  if (!nodes.some(n => n.id === target)) return { source: null, edge: null, kind: 'cancel', message: 'Service no longer exists.' };
  if (!source || !nodes.some(n => n.id === source)) return { source: target, edge: null, kind: 'select', message: 'Source selected. Click the destination node to connect.' };
  if (source === target) return { source: null, edge: null, kind: 'cancel', message: 'Connection cancelled.' };
  const result = validateEdge(nodes, edges, source, target);
  return result.ok
    ? { source: null, edge: { from: source, to: target }, kind: 'connect', message: 'Connection added.' }
    : { source, edge: null, kind: 'error', message: `${result.reason} Click another destination, or press Escape to cancel.` };
}

export function activeSituations(run, scenario) {
  return scenario.events.filter(e => {
    if (run.time < e.at || run.time >= e.until) return false;
    if (e.type !== 'outage') return true;
    const index = scenario.events.indexOf(e);
    const eligible = run.nodes.filter(n => (e.targetKinds ?? ['compute', 'fargate']).includes(n.kind));
    const target = Object.hasOwn(run.outageTargets, index) ? run.outageTargets[index]
      : eligible[(e.targetOffset ?? 0) % eligible.length]?.id;
    if (!target || !run.nodes.some(n => n.id === target)) return false;
    const service = run.services?.[target];
    return !service || !Object.hasOwn(run.outageReplicas, index) || service.replicas.some(s => s.id === run.outageReplicas[index]);
  });
}

export function describeSituation(run, scenario) {
  if (!run) return { key: 'ready', tone: 'idle', title: 'READY TO BUILD', message: 'Build now or adapt live. Black Friday, DDoS and maintenance arrive automatically.' };
  if (run.status === 'finished') return { key: 'finished', tone: 'complete', title: 'ROUND COMPLETE', message: 'Inspect your debrief, then improve the design. Earlier failures remain in your totals.' };
  // Use current simulation boundaries, not last tick's event labels. At an end
  // boundary an incident must disappear even if no next tick has run yet.
  const events = activeSituations(run, scenario);
  const down = run.nodes.filter(n => run.nodeRuntime[n.id]?.state === 'down');
  const managedRecovery = run.nodes.filter(n => run.services?.[n.id]?.replicas.some(s => s.state !== 'ready'));
  const rebooting = run.nodes.filter(n => run.nodeRuntime[n.id]?.state === 'rebooting');
  const baseTone = events.some(e => e.type === 'attack') ? 'attack' : down.length ? 'failure'
    : events.some(e => e.type === 'outage') ? 'maintenance' : events.length ? 'surge' : rebooting.length || managedRecovery.length ? 'recovery' : 'calm';
  const title = events.length ? events.map(e => e.label).join(' + ') : down.length ? 'SERVICE SHUTDOWN' : managedRecovery.length ? 'REPLICA STARTUP / REPLACEMENT' : rebooting.length ? 'REBOOT IN PROGRESS' : 'TRAFFIC FLOWING';
  const message = events.map(e => `${e.description} ${Math.ceil(e.until - run.time)}s remaining.`);
  if (down.length) message.push(`${down.length} service${down.length === 1 ? '' : 's'} shut down. Select one and use Reboot, or add capacity and reroute.`);
  if (rebooting.length) message.push(`${rebooting.length} service${rebooting.length === 1 ? '' : 's'} rebooting.`);
  if (managedRecovery.length) message.push(`${managedRecovery.length} managed service${managedRecovery.length === 1 ? '' : 's'} starting or replacing replicas automatically. Watch ready capacity.`);
  if (!message.length) message.push(run.time > 30 ? 'Incident cleared. Keep watching capacity; add, remove and rewire services live.' : 'Customer traffic is growing. Click a source, then its destination to connect.');
  const paused = run.status === 'paused';
  return {
    key: `${events.map(e => scenario.events.indexOf(e)).join(',')}|${down.map(n => n.id).sort().join(',')}|${rebooting.map(n => n.id).sort().join(',')}`,
    tone: paused ? 'paused' : baseTone,
    title: `${paused ? 'PAUSED · ' : ''}${title.toUpperCase()}`,
    message: `${paused ? 'Clock and recovery timers are frozen. ' : ''}${message.join(' ')}`,
    eventTypes: events.map(e => e.type),
  };
}

export function musicMood(run, scenario) {
  if (!run || run.status !== 'running') return 'calm';
  const events = activeSituations(run, scenario);
  const attack = events.some(e => e.type === 'attack');
  const maintenance = events.some(e => e.type === 'outage');
  const surge = events.some(e => e.type === 'demand' || e.type === 'cache');
  const down = run.nodes.some(n => run.nodeRuntime[n.id]?.state === 'down');
  if (down || attack && maintenance) return 'critical';
  const strained = run.nodes.some(n => n.kind !== 'internet' && (run.last.nodes[n.id]?.utilization > 1.05 || run.last.nodes[n.id]?.state === 'throttled'));
  if (attack || maintenance && surge || strained) return 'tense';
  const recovering = Object.values(run.services ?? {}).some(s => s.replicas.some(r => r.state !== 'ready'));
  return maintenance || surge || recovering ? 'elevated' : 'calm';
}
