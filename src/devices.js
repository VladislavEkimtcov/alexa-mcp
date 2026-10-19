// Helpers for the smart-home device tools (compact listing, enable/disable, delete).
// Pure functions with no network access, so the safety checks can be tested
// without an Amazon session.

/** The appliance ID of a smart-home entry as returned by getSmarthomeDevicesV2. */
function applianceIdOf(device) {
  return device && device.legacyAppliance ? device.legacyAppliance.applianceId : undefined;
}

/**
 * Find the smart-home device that a change request refers to, or throw.
 *
 * The caller must give both the applianceId and the device's exact friendly
 * name. Several devices share a name here ("Living Room", "Braava jet"), and
 * the IDs are long opaque strings, so requiring both keeps a stale or
 * mistyped ID from touching a different device.
 */
export function findDeviceToChange(devices, applianceId, expectedName) {
  if (!Array.isArray(devices)) {
    throw new Error('Unexpected smart-home device list from Amazon.');
  }
  const device = devices.find((d) => applianceIdOf(d) === applianceId);
  if (!device) {
    throw new Error(`No smart-home device with applianceId "${applianceId}". Nothing changed.`);
  }
  if (device.friendlyName !== expectedName) {
    throw new Error(
      `Device ${applianceId} is named "${device.friendlyName}", not "${expectedName}". Nothing changed.`
    );
  }
  return device;
}

/** Names of the groups that list this appliance as a member. */
export function groupsContaining(groups, applianceId) {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((g) => Array.isArray(g.applianceIds) && g.applianceIds.includes(applianceId))
    .map((g) => g.name);
}

/** Refuse to delete a device that a group still lists, so no group is left with a dead entry. */
export function assertNotInGroup(groups, applianceId, name) {
  const inGroups = groupsContaining(groups, applianceId);
  if (inGroups.length > 0) {
    throw new Error(
      `"${name}" is still a member of: ${inGroups.join(', ')}. Remove it from the group first. Nothing deleted.`
    );
  }
}

/**
 * One row per device: the fields needed to pick a target for a change.
 * The raw device listing is ~900k characters, too large to read inline.
 */
export function summarizeDevices(devices, groups = []) {
  if (!Array.isArray(devices)) {
    throw new Error('Unexpected smart-home device list from Amazon.');
  }
  return devices
    .map((d) => {
      const applianceId = applianceIdOf(d);
      return {
        name: d.friendlyName,
        applianceId,
        enablement: d.enablement,
        category: d.displayCategories && d.displayCategories.primary
          ? d.displayCategories.primary.value
          : null,
        manufacturer: d.manufacturer && d.manufacturer.value ? d.manufacturer.value.text : null,
        groups: groupsContaining(groups, applianceId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.applianceId.localeCompare(b.applianceId));
}
