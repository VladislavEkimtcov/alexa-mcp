// Offline checks for src/devices.js (no Amazon session needed). Run: npm test
import assert from 'node:assert/strict';
import {
  findDeviceToChange,
  groupsContaining,
  assertNotInGroup,
  summarizeDevices,
} from '../src/devices.js';

const dev = (name, applianceId, enablement = 'ENABLED') => ({
  friendlyName: name,
  enablement,
  legacyAppliance: { applianceId },
  displayCategories: { primary: { value: 'LIGHT' } },
  manufacturer: { value: { text: 'Acme' } },
});

const devices = [
  dev('Backup', 'SKILL_a_1'),
  dev('Living Room', 'SKILL_b_2'),
  dev('Living Room', 'SKILL_c_3', 'DISABLED_BY_CUSTOMER'),
];
const groups = [
  { name: 'Rabbit Town', applianceIds: ['SKILL_b_2', 'SKILL_c_3'] },
  { name: 'Empty', applianceIds: [] },
];

// 1. Matching id + name returns the device.
assert.equal(findDeviceToChange(devices, 'SKILL_a_1', 'Backup'), devices[0]);

// 2. Unknown id is refused.
assert.throws(() => findDeviceToChange(devices, 'SKILL_zzz', 'Backup'), /No smart-home device/);

// 3. Right id, wrong name is refused and names the real device.
assert.throws(
  () => findDeviceToChange(devices, 'SKILL_a_1', 'Thermostat'),
  /is named "Backup", not "Thermostat"/
);

// 4. Same-name devices are told apart by id.
assert.equal(findDeviceToChange(devices, 'SKILL_c_3', 'Living Room'), devices[2]);

// 5. A non-array listing is refused.
assert.throws(() => findDeviceToChange({}, 'SKILL_a_1', 'Backup'), /Unexpected/);

// 6. Group membership lookups; a grouped device cannot be deleted.
assert.deepEqual(groupsContaining(groups, 'SKILL_b_2'), ['Rabbit Town']);
assert.deepEqual(groupsContaining(groups, 'SKILL_a_1'), []);
assert.doesNotThrow(() => assertNotInGroup(groups, 'SKILL_a_1', 'Backup'));
assert.throws(
  () => assertNotInGroup(groups, 'SKILL_b_2', 'Living Room'),
  /still a member of: Rabbit Town/
);

// 7. Summary is compact, sorted by name and carries group names.
const rows = summarizeDevices(devices, groups);
assert.deepEqual(
  rows.map((r) => [r.name, r.applianceId, r.groups.length]),
  [
    ['Backup', 'SKILL_a_1', 0],
    ['Living Room', 'SKILL_b_2', 1],
    ['Living Room', 'SKILL_c_3', 1],
  ]
);
assert.equal(rows[0].manufacturer, 'Acme');
assert.equal(rows[2].enablement, 'DISABLED_BY_CUSTOMER');

console.log('devices.test.mjs: all checks passed');
