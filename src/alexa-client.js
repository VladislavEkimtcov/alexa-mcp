import Alexa from 'alexa-remote2';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveAuthDir() {
  const envDir = process.env.ALEXA_MCP_AUTH_DIR;
  if (envDir) {
    return envDir.startsWith('~/') ? join(homedir(), envDir.slice(2)) : envDir;
  }
  return join(__dirname, '..', '.auth-data');
}

const AUTH_DIR = resolveAuthDir();
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

export class AlexaClient {
  constructor() {
    this.alexa = new Alexa();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    const savedAuth = this._loadAuth();
    if (!savedAuth) {
      throw new Error(
        'No authentication data found. Run "npm run auth" first to authenticate with Amazon.'
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout after 30s'));
      }, 30000);

      this.alexa.init(
        {
          cookie: savedAuth.cookie,
          formerRegistrationData: savedAuth.formerRegistrationData,
          proxyOwnIp: '127.0.0.1',
          proxyPort: 0,
          amazonPage: savedAuth.amazonPage || 'amazon.com',
          acceptLanguage: 'es-MX',
          amazonPageProxyLanguage: 'es_MX',
          useWsMqtt: false,
          cookieRefreshInterval: 4 * 24 * 60 * 60 * 1000, // 4 days
        },
        (err) => {
          clearTimeout(timeout);
          if (err) {
            if (err.message && err.message.includes('Cookie')) {
              reject(
                new Error(
                  'Authentication expired. Run "npm run auth" to re-authenticate.'
                )
              );
            } else {
              reject(err);
            }
            return;
          }
          this.initialized = true;

          // Save refreshed auth data
          this.alexa.cookie &&
            this._saveAuth({
              cookie: this.alexa.cookie,
              formerRegistrationData:
                this.alexa.cookieData || savedAuth.formerRegistrationData,
              amazonPage: savedAuth.amazonPage,
            });

          resolve();
        }
      );
    });
  }

  // --- Device Management ---

  async getDevices() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getDevices((err, result) => {
        if (err) return reject(err);
        const devices = (result?.devices || []).map((d) => ({
          name: d.accountName,
          serialNumber: d.serialNumber,
          deviceType: d.deviceType,
          deviceFamily: d.deviceFamily,
          online: d.online,
          capabilities: d.capabilities,
        }));
        resolve(devices);
      });
    });
  }

  // --- Smart Home ---

  async getSmarthomeDevices() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getSmarthomeDevicesV2((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  async getSmarthomeGroups() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getSmarthomeGroups((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  async querySmarthomeDevices(entityIds) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.querySmarthomeDevices(entityIds, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // --- Announcements ---

  async announce(serialNumber, message) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.sendSequenceCommand(
        serialNumber,
        'announcement',
        message,
        (err) => {
          if (err) return reject(err);
          resolve({ success: true });
        }
      );
    });
  }

  async speakSSML(serialNumber, ssml) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.sendSequenceCommand(serialNumber, 'ssml', ssml, (err) => {
        if (err) return reject(err);
        resolve({ success: true });
      });
    });
  }

  async textCommand(serialNumber, text) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.sendSequenceCommand(
        serialNumber,
        'textCommand',
        text,
        (err) => {
          if (err) return reject(err);
          resolve({ success: true });
        }
      );
    });
  }

  // --- Volume ---

  async setVolume(serialNumber, volume) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.sendSequenceCommand(
        serialNumber,
        'volume',
        volume,
        (err) => {
          if (err) return reject(err);
          resolve({ success: true });
        }
      );
    });
  }

  async getAllDeviceVolumes() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getAllDeviceVolumes((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // --- Routines ---

  async getRoutines() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getAutomationRoutines((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  async executeRoutine(routine) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.executeAutomationRoutine(routine, (err) => {
        if (err) return reject(err);
        resolve({ success: true });
      });
    });
  }

  // --- Lists ---

  async getLists() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getListsV2((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  async getListItems(listId) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getListItemsV2(listId, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  async addListItem(listId, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.addListItem(listId, value, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // --- Group Management ---

  _enrichCookie() {
    const cookie = this.alexa.cookie;
    if (!cookie) return;
    const cookies = {};
    cookie.split(';').forEach((c) => {
      const [name, ...rest] = c.trim().split('=');
      cookies[name] = rest.join('=');
    });
    let enriched = cookie;
    // Add at-main/ubid-main aliases for regional cookies (required for write ops)
    for (const suffix of ['acbmx', 'acbus', 'acbde', 'acbuk', 'acbjp', 'acbin']) {
      if (cookies[`at-${suffix}`] && !cookies['at-main']) {
        enriched += `; at-main=${cookies[`at-${suffix}`]}`;
      }
      if (cookies[`ubid-${suffix}`] && !cookies['ubid-main']) {
        enriched += `; ubid-main=${cookies[`ubid-${suffix}`]}`;
      }
    }
    this.alexa.cookie = enriched;
  }

  async createSmarthomeGroup(name, applianceIds) {
    await this.init();
    this._enrichCookie();
    return new Promise((resolve, reject) => {
      const flags = {
        method: 'POST',
        data: JSON.stringify({
          name,
          type: 'SPACE',
          applianceIds: applianceIds || [],
        }),
      };
      this.alexa.httpsGet('/api/phoenix/group', (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }, flags);
    });
  }

  async updateSmarthomeGroup(groupId, name, applianceIds) {
    await this.init();
    this._enrichCookie();
    return new Promise((resolve, reject) => {
      const flags = {
        method: 'PUT',
        data: JSON.stringify({
          name,
          applianceIds: applianceIds || [],
        }),
      };
      this.alexa.httpsGet(`/api/phoenix/group/${groupId}`, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }, flags);
    });
  }

  async deleteSmarthomeGroup(groupId) {
    await this.init();
    this._enrichCookie();
    return new Promise((resolve, reject) => {
      this.alexa.deleteSmarthomeGroup(groupId, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // --- Bluetooth ---

  async getBluetoothDevices() {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.getBluetoothDevices((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // --- Do Not Disturb ---

  async setDoNotDisturb(serialNumber, enabled) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.alexa.sendSequenceCommand(
        serialNumber,
        'deviceDoNotDisturb',
        enabled,
        (err) => {
          if (err) return reject(err);
          resolve({ success: true });
        }
      );
    });
  }

  // --- Auth helpers ---

  _loadAuth() {
    if (!existsSync(AUTH_FILE)) return null;
    try {
      return JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    } catch {
      return null;
    }
  }

  _saveAuth(data) {
    writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
    chmodSync(AUTH_FILE, 0o600);
  }
}
