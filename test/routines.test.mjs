// Offline checks for src/routines.js (no Amazon session needed). Run: npm test
import assert from 'node:assert/strict';
import { findRoutineToDelete, describeRoutine } from '../src/routines.js';

const routines = [
  {
    automationId: 'amzn1.alexa.automation.aaa',
    name: 'Light Bedtime Routine',
    status: 'ENABLED',
    triggers: [{ type: 'CustomUtterance', payload: { utterance: 'light bedtime' } }],
  },
  { automationId: 'amzn1.alexa.automation.bbb', name: 'Every Day, at 3:40 AM', status: 'ENABLED', triggers: [] },
];

// 1. Matching id + name returns the routine.
assert.equal(
  findRoutineToDelete(routines, 'amzn1.alexa.automation.aaa', 'Light Bedtime Routine'),
  routines[0]
);

// 2. Unknown id is refused.
assert.throws(
  () => findRoutineToDelete(routines, 'amzn1.alexa.automation.zzz', 'Light Bedtime Routine'),
  /No routine with automationId/
);

// 3. Right id but wrong name is refused, and the message names the real routine.
assert.throws(
  () => findRoutineToDelete(routines, 'amzn1.alexa.automation.bbb', 'Light Bedtime Routine'),
  /is named "Every Day, at 3:40 AM"/
);

// 4. Name match is exact (no case-folding or trimming).
assert.throws(() => findRoutineToDelete(routines, 'amzn1.alexa.automation.aaa', 'light bedtime routine'));
assert.throws(() => findRoutineToDelete(routines, 'amzn1.alexa.automation.aaa', 'Light Bedtime Routine '));

// 5. A non-array response from Amazon is refused.
assert.throws(() => findRoutineToDelete(undefined, 'x', 'y'), /Unexpected routine list/);
assert.throws(() => findRoutineToDelete({}, 'x', 'y'), /Unexpected routine list/);

// 6. describeRoutine summarises, with and without triggers.
assert.deepEqual(describeRoutine(routines[0]), {
  automationId: 'amzn1.alexa.automation.aaa',
  name: 'Light Bedtime Routine',
  status: 'ENABLED',
  trigger: 'CustomUtterance',
});
assert.equal(describeRoutine(routines[1]).trigger, null);

console.log('routines.test.mjs: all checks passed');

// --- addSmarthomeSteps ---
import { addSmarthomeSteps } from '../src/routines.js';

const sleepRoutine = {
  automationId: 'amzn1.alexa.automation.sleep',
  name: 'vlad enable sleep',
  sequence: {
    startNode: {
      '@type': 'com.amazon.alexa.behaviors.model.SerialNode',
      nodesToExecute: [
        {
          type: 'Alexa.SmartHome.Batch',
          operationPayload: {
            target: 'lamp-1',
            customerId: 'CUST1',
            operations: [{ type: 'turnOn' }],
          },
        },
      ],
    },
  },
};
const HALO = ['c352bc43-26db-4823-854c-d8961d8e2ab1', '5073cc7d-f944-45d1-8ab7-325a9531ae75'];

// 4. Appends one batch node per target, reusing the routine's customer ID.
{
  const { routine, added } = addSmarthomeSteps(sleepRoutine, 'turnOff', HALO);
  assert.deepEqual(added, HALO);
  const nodes = routine.sequence.startNode.nodesToExecute;
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[1].operationPayload, { target: HALO[0], customerId: 'CUST1', operations: [{ type: 'turnOff' }] });
  assert.equal(nodes[1].type, 'Alexa.SmartHome.Batch');
}

// 5. Input routine is not mutated.
assert.equal(sleepRoutine.sequence.startNode.nodesToExecute.length, 1);

// 6. Running again adds nothing (idempotent).
{
  const once = addSmarthomeSteps(sleepRoutine, 'turnOff', HALO).routine;
  const twice = addSmarthomeSteps(once, 'turnOff', HALO);
  assert.deepEqual(twice.added, []);
  assert.equal(twice.routine.sequence.startNode.nodesToExecute.length, 3);
}

// 7. A routine without a sequence is refused.
assert.throws(() => addSmarthomeSteps({ name: 'x' }, 'turnOff', HALO), /no sequence/);

// 8. Steps nested in a ParallelNode are found: no duplicate on re-run, and the owner ID is the fallback.
{
  const nested = {
    automationId: 'amzn1.alexa.automation.nested',
    name: 'nested',
    owner: { id: 'OWNER1' },
    sequence: {
      startNode: {
        nodesToExecute: [
          {
            '@type': 'com.amazon.alexa.behaviors.model.ParallelNode',
            nodesToExecute: [
              { type: 'Alexa.SmartHome.Batch', operationPayload: { target: HALO[0], customerId: 'CUST2', operations: [{ type: 'turnOff' }] } },
            ],
          },
        ],
      },
    },
  };
  const r = addSmarthomeSteps(nested, 'turnOff', HALO);
  assert.deepEqual(r.added, [HALO[1]]); // HALO[0] already off in the nested node
  const top = r.routine.sequence.startNode.nodesToExecute[1];
  assert.equal(top.operationPayload.customerId, 'CUST2');
  // With no batch nodes at all, fall back to the owner ID.
  const bare = { ...nested, sequence: { startNode: { nodesToExecute: [] } } };
  assert.equal(addSmarthomeSteps(bare, 'turnOff', HALO).routine.sequence.startNode.nodesToExecute[0].operationPayload.customerId, 'OWNER1');
}

// 9. A routine just created in the app (only a "Do Nothing" placeholder) is filled
// with the Serial > Parallel wrapper Amazon uses, with the owner ID as customer.
{
  const empty = {
    automationId: 'amzn1.alexa.automation.empty',
    name: 'turn on lights',
    owner: { id: 'OWNER1' },
    sequence: {
      sequenceId: 'seq1',
      startNode: { type: 'DoNothing', skillId: 'noop', operationPayload: { doNothing: [] } },
    },
  };
  const r = addSmarthomeSteps(empty, 'turnOn', HALO);
  assert.deepEqual(r.added, HALO);
  const start = r.routine.sequence.startNode;
  assert.match(start['@type'], /SerialNode$/);
  const par = start.nodesToExecute[0];
  assert.match(par['@type'], /ParallelNode$/);
  assert.equal(par.nodesToExecute.length, HALO.length);
  assert.deepEqual(par.nodesToExecute.map((n) => n.operationPayload.target), HALO);
  assert.equal(par.nodesToExecute[0].operationPayload.customerId, 'OWNER1');
  assert.deepEqual(par.nodesToExecute[0].operationPayload.operations, [{ type: 'turnOn' }]);
  assert.equal(r.routine.sequence.sequenceId, 'seq1'); // rest of the sequence kept
  assert.equal(empty.sequence.startNode.type, 'DoNothing'); // input not modified
  // Running it again on the filled routine adds nothing.
  assert.deepEqual(addSmarthomeSteps(r.routine, 'turnOn', HALO).added, []);
  // A placeholder with no targets to add stays untouched.
  assert.equal(addSmarthomeSteps(empty, 'turnOn', []).routine.sequence.startNode.type, 'DoNothing');
}

// 10. Write body: flat, trigger/sequence as JSON strings, trigger payload stringified too.
import { buildRoutineWriteBody, collectSmarthomeSteps } from '../src/routines.js';
{
  const read = {
    automationId: 'amzn1.alexa.automation.w1',
    name: 'turn on lights',
    status: 'ENABLED',
    triggers: [
      {
        id: 'amzn1.alexa.trigger.x',
        type: 'CustomUtterance',
        skillId: 'amzn1.ask.1p.customutterance',
        payload: { utterance: 'turn on lights', locale: 'en-US' },
        imageUrl: { url: 'drop me' },
        primitiveId: 'drop me',
      },
    ],
    sequence: {
      '@type': 'com.amazon.alexa.behaviors.model.Sequence',
      sequenceId: 'drop me',
      startNode: {
        '@type': 'com.amazon.alexa.behaviors.model.SerialNode',
        name: null,
        nodesToExecute: [
          {
            '@type': 'com.amazon.alexa.behaviors.model.ParallelNode',
            name: null,
            nodesToExecute: [
              {
                '@type': 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode',
                type: 'Alexa.SmartHome.Batch',
                skillId: 'amzn1.ask.1p.smarthome',
                primitiveId: 'drop me',
                operationPayload: { target: HALO[0], customerId: 'C1', operations: [{ type: 'turnOn' }] },
              },
            ],
          },
        ],
      },
    },
  };
  const body = buildRoutineWriteBody(read);
  assert.deepEqual(Object.keys(body).sort(), ['behaviorId', 'name', 'sequenceJson', 'status', 'triggerJson', 'triggerJsonList']);
  assert.equal(body.behaviorId, read.automationId);
  assert.equal(typeof body.triggerJson, 'string');
  assert.deepEqual(body.triggerJsonList, [body.triggerJson]);
  const trig = JSON.parse(body.triggerJson);
  assert.equal(trig.id, null);
  assert.equal(typeof trig.payload, 'string'); // double-encoded
  assert.equal(JSON.parse(trig.payload).utterance, 'turn on lights');
  assert.equal(trig.imageUrl, undefined);
  const seq = JSON.parse(body.sequenceJson);
  assert.deepEqual(Object.keys(seq).sort(), ['@type', 'startNode']);
  const leaf = seq.startNode.nodesToExecute[0].nodesToExecute[0];
  assert.equal(leaf.context, null);
  assert.equal(leaf.primitiveId, undefined);
  assert.equal(leaf.operationPayload.target, HALO[0]);
  assert.deepEqual(collectSmarthomeSteps(read), [`${HALO[0]}|turnOn`]);
  assert.deepEqual(collectSmarthomeSteps({}), []);
  assert.throws(() => buildRoutineWriteBody({ ...read, triggers: [] }), /no trigger/);
  assert.equal(read.sequence.sequenceId, 'drop me'); // input untouched
  // A placeholder routine filled by addSmarthomeSteps round-trips into a valid body.
  const empty = { ...read, sequence: { '@type': read.sequence['@type'], startNode: { type: 'DoNothing', skillId: 'noop', operationPayload: { doNothing: [] } } }, owner: { id: 'O' } };
  const filled = addSmarthomeSteps(empty, 'turnOn', HALO);
  assert.equal(filled.addedNodes.length, HALO.length);
  const fb = JSON.parse(buildRoutineWriteBody(filled.routine).sequenceJson);
  assert.equal(fb.startNode.nodesToExecute[0].nodesToExecute.length, HALO.length);
}
