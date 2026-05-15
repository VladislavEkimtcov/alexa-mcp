/**
 * Authentication script for Alexa MCP Server.
 * Run this once to authenticate with Amazon.
 *
 * Usage: npm run auth
 *
 * This will start a local proxy server. Open the URL in your browser,
 * log in with your Amazon account, and the credentials will be saved locally.
 */

import Alexa from 'alexa-remote2';
import { writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = join(__dirname, '..', '.auth-data');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

if (!existsSync(AUTH_DIR)) {
  mkdirSync(AUTH_DIR, { recursive: true });
}

const alexa = new Alexa();
const PROXY_PORT = 3457;

console.log('');
console.log('=== Alexa MCP Server - Autenticacion ===');
console.log('');

alexa.init(
  {
    cookie: '',
    proxyOnly: true,
    proxyOwnIp: 'localhost',
    proxyPort: PROXY_PORT,
    proxyListenBind: '0.0.0.0',
    amazonPage: 'amazon.com',
    acceptLanguage: 'es-MX',
    amazonPageProxyLanguage: 'es_MX',
    useWsMqtt: false,
    proxyLogLevel: 'warn',
  },
  (err) => {
    // The callback fires TWICE in proxyOnly mode:
    // 1st: with an error containing "Please open..." (proxy is ready)
    // 2nd: with null error after successful auth (cookie obtained)

    if (err) {
      const msg = err.message || String(err);

      // This is the expected "proxy ready" message - NOT a real error
      if (msg.includes('Please open') || msg.includes('browser')) {
        console.log('Proxy listo. Abre esta URL en tu navegador:');
        console.log('');
        console.log(`  http://localhost:${PROXY_PORT}`);
        console.log('');
        console.log('Inicia sesion con tu cuenta de Amazon.');
        console.log('Esperando autenticacion...');
        console.log('');
        return;
      }

      // Real error
      console.error('Error durante la autenticacion:', msg);
      process.exit(1);
    }

    // Success! Cookie obtained
    const authData = {
      cookie: alexa.cookie,
      formerRegistrationData: alexa.cookieData,
      amazonPage: 'amazon.com',
      authenticatedAt: new Date().toISOString(),
    };

    writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
    chmodSync(AUTH_FILE, 0o600);

    console.log('');
    console.log('Autenticacion exitosa!');
    console.log(`Credenciales guardadas en: ${AUTH_FILE}`);
    console.log('');
    console.log('Ya puedes cerrar este proceso con Ctrl+C.');
    console.log('');

    setTimeout(() => process.exit(0), 2000);
  }
);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nCerrando...');
  process.exit(0);
});
