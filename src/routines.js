// Helpers for alexa_delete_routine. Pure functions with no network access,
// so the safety check can be tested without an Amazon session.

/**
 * Find the routine that a delete request refers to, or throw.
 *
 * The caller must give both the automationId and the routine's exact name, so
 * a wrong or stale ID can't delete a different routine than the one intended.
 */
export function findRoutineToDelete(routines, automationId, expectedName) {
  if (!Array.isArray(routines)) {
    throw new Error('Unexpected routine list from Amazon.');
  }
  const routine = routines.find((r) => r.automationId === automationId);
  if (!routine) {
    throw new Error(`No routine with automationId "${automationId}". Nothing deleted.`);
  }
  if (routine.name !== expectedName) {
    throw new Error(
      `Routine ${automationId} is named "${routine.name}", not "${expectedName}". Nothing deleted.`
    );
  }
  return routine;
}

/** Short summary of a routine for logs and tool output. */
export function describeRoutine(routine) {
  const trigger = routine.triggers && routine.triggers[0];
  return {
    automationId: routine.automationId,
    name: routine.name,
    status: routine.status,
    trigger: trigger ? trigger.type : null,
  };
}

/**
 * Build a copy of a routine with extra smart-home steps appended to its
 * sequence. Pure: the input routine is not modified.
 *
 * `targets` are device/group entity IDs. A step is skipped when the routine
 * already has the same operation on the same target, so re-running is safe.
 * Returns { routine, added } where `added` lists the targets actually added.
 */
export function addSmarthomeSteps(routine, operation, targets) {
  const startNode = routine.sequence && routine.sequence.startNode;
  // A routine just created in the app has only a "Do Nothing" placeholder as its
  // start node. Replace it with the Serial > Parallel wrapper Amazon uses for real
  // routines, then fill it like any other.
  const isPlaceholder =
    startNode && startNode.type === 'DoNothing' && !Array.isArray(startNode.nodesToExecute);
  if (!startNode || (!isPlaceholder && !Array.isArray(startNode.nodesToExecute))) {
    throw new Error('Routine has no sequence to append to. Nothing changed.');
  }
  // Real routines nest steps in ParallelNode/SerialNode groups, so search the whole tree.
  const existing = [];
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Alexa.SmartHome.Batch' && node.operationPayload) existing.push(node);
    for (const child of node.nodesToExecute || []) collect(child);
  };
  collect(startNode);
  const customerId =
    existing.map((n) => n.operationPayload.customerId).find(Boolean) ||
    (routine.owner && routine.owner.id);
  if (!customerId) {
    throw new Error('Could not find the customer ID in this routine. Nothing changed.');
  }
  const done = new Set(
    existing.flatMap((n) =>
      (n.operationPayload.operations || []).map((op) => `${n.operationPayload.target}|${op.type}`)
    )
  );
  const added = [];
  const newNodes = [];
  for (const target of targets) {
    if (done.has(`${target}|${operation}`)) continue;
    done.add(`${target}|${operation}`);
    added.push(target);
    newNodes.push({
      '@type': 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode',
      nodeState: null,
      name: null,
      type: 'Alexa.SmartHome.Batch',
      skillId: 'amzn1.ask.1p.smarthome',
      operationPayload: {
        target,
        customerId,
        operations: [{ type: operation }],
      },
      presentationDataList: null,
      clientData: null,
      context: null,
      tag: null,
    });
  }
  const newStartNode = isPlaceholder
    ? newNodes.length === 0
      ? startNode
      : {
          '@type': 'com.amazon.alexa.behaviors.model.SerialNode',
          name: null,
          nodesToExecute: [
            {
              '@type': 'com.amazon.alexa.behaviors.model.ParallelNode',
              name: null,
              nodesToExecute: newNodes,
            },
          ],
        }
    : { ...startNode, nodesToExecute: [...startNode.nodesToExecute, ...newNodes] };
  return {
    routine: {
      ...routine,
      sequence: { ...routine.sequence, startNode: newStartNode },
    },
    added,
    addedNodes: newNodes,
  };
}

/** Smart-home targets+operations a routine acts on, as "target|operation" strings. */
export function collectSmarthomeSteps(routine) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Alexa.SmartHome.Batch' && node.operationPayload) {
      for (const op of node.operationPayload.operations || []) {
        found.push(`${node.operationPayload.target}|${op.type}`);
      }
    }
    for (const child of node.nodesToExecute || []) walk(child);
  };
  walk(routine && routine.sequence && routine.sequence.startNode);
  return found;
}

/**
 * Turn a routine as READ from Amazon into the flat body Amazon expects on WRITE.
 *
 * The read shape (nested objects) is silently ignored by PUT /api/behaviors/automations/{id}
 * (HTTP 200, nothing changes). The write shape is a flat object whose trigger and
 * sequence are JSON strings, and each trigger's own `payload` is a JSON string too.
 * Format learned from snordquist/alexa-mcp (MIT), ARCHITECTURE.md and src/routines.ts.
 * Pure: the input is not modified.
 */
export function buildRoutineWriteBody(routine) {
  const triggers = routine.triggers || [];
  if (triggers.length === 0) throw new Error('Routine has no trigger to write back. Nothing changed.');
  const triggerJsons = triggers.map((t) => {
    const out = { id: null, skillId: t.skillId, type: t.type, payload: JSON.stringify(t.payload) };
    return JSON.stringify(t['@type'] ? { '@type': t['@type'], ...out } : out);
  });
  const rebuild = (node) => {
    if (Array.isArray(node.nodesToExecute)) {
      return { '@type': node['@type'], nodesToExecute: node.nodesToExecute.map(rebuild) };
    }
    if (node.type === 'DoNothing') return node;
    return {
      '@type': node['@type'],
      type: node.type,
      skillId: node.skillId,
      operationPayload: node.operationPayload,
      context: null,
    };
  };
  const seq = routine.sequence;
  if (!seq || !seq.startNode) throw new Error('Routine has no sequence to write back. Nothing changed.');
  return {
    behaviorId: routine.automationId,
    name: routine.name,
    status: routine.status,
    triggerJson: triggerJsons[0],
    triggerJsonList: triggerJsons,
    sequenceJson: JSON.stringify({ '@type': seq['@type'], startNode: rebuild(seq.startNode) }),
  };
}
