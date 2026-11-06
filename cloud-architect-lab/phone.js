import { activeSituations } from './interaction.js';
import { MANAGED_KINDS, serviceSnapshot } from './engine.js';

// Phone policy is independent of orientation so portrait cannot escape its gate.
// Coarse-pointer tablets with a short screen side >600px retain the normal UI.
export function phoneLayout({ coarse, width, height, screenWidth = width, screenHeight = height }) {
  const shortSide = Math.min(screenWidth || width, screenHeight || height);
  const phone = !!coarse && shortSide > 0 && shortSide <= 600;
  return { phone, blocked: phone && height >= width };
}

export function beginTap(event) {
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, cancelled: false };
}
export function moveTap(gesture, event, threshold = 10) {
  if (gesture && gesture.pointerId === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > threshold) gesture.moved = true;
}
export function isTap(gesture) { return !!gesture && !gesture.moved && !gesture.cancelled; }

// Live edits clear last-tick measurements; current maintenance/reboot eligibility
// must still be derived from frozen targets and runtime state, not stale DOM.
export function serviceHealth(run, node, scenario) {
  if (MANAGED_KINDS.includes(node.kind)) {
    const s = run?.services[node.id] ? serviceSnapshot(run, node.id) : null;
    return { state: s?.status ?? 'healthy', down: s ? !s.ready : false,
      maintenanceRemaining: s ? Math.max(0, ...s.replicas.map(r => r.maintenanceRemaining)) : 0, rebootRemaining: 0 };
  }
  const stat = run?.last.nodes[node.id], runtime = run?.nodeRuntime[node.id];
  let maintenanceRemaining = 0;
  if (run) for (const event of activeSituations(run, scenario).filter(e => e.type === 'outage')) {
    const index = scenario.events.indexOf(event);
    const eligible = run.nodes.filter(n => (event.targetKinds ?? ['compute', 'fargate']).includes(n.kind));
    const target = Object.hasOwn(run.outageTargets, index) ? run.outageTargets[index] : eligible[(event.targetOffset ?? 0) % eligible.length]?.id;
    if (target === node.id) maintenanceRemaining = Math.max(maintenanceRemaining, event.until - run.time);
  }
  const state = maintenanceRemaining ? 'maintenance' : ['down', 'rebooting'].includes(runtime?.state) ? runtime.state : stat?.state ?? runtime?.state ?? 'healthy';
  return { state, down: ['maintenance', 'down', 'rebooting'].includes(state), maintenanceRemaining,
    rebootRemaining: runtime?.state === 'rebooting' ? Math.max(0, runtime.recoverAt - run.time) : 0 };
}
