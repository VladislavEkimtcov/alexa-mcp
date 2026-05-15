# Changelog - alexa-mcp

Bitácora cronológica de cambios significativos en este proyecto.

## Convención

- Mensajes en español, formato corto
- Solo eventos significativos (no rutinarios)
- Orden cronológico inverso: lo más reciente arriba
- Al cerrar trabajo importante: actualizar entrada y hacer commit

---

## 2026-05-15 — v1.1.0

### Soporte multi-instancia

- Nueva env var `ALEXA_MCP_AUTH_DIR` permite que un solo clone del repo sirva varias cuentas de Alexa, cada una con su propio `auth.json`. Default sigue siendo `.auth-data/` del proyecto (compat hacia atrás).
- `auth.js`: añadido fallback que persiste la cookie aunque el registro post-auth de Amazon falle (cuentas con device-registration con quirks).

### Setup interno

- Migración a arquitectura "una codebase, múltiples instancias":
  - `homeassistant` → `~/.alexa-mcp/personal/auth.json`
  - `homeassistant-pa` → `~/.alexa-mcp/pa/auth.json`
- `alexa-mcp-pa/` archivado como `alexa-mcp-pa.bak/` (a borrar cuando ya no se necesite).

## 2026-05-15 — v1.0.0

### Initial public release

- Repo publicado en <https://github.com/RenatoAscencio/alexa-mcp>
- Bump @modelcontextprotocol/sdk → 1.29.0, zod → 4.4.3 (deps actualizadas, vulnerabilidades altas/moderadas resueltas)
- README en inglés, LICENSE MIT

## 2026-05-11

### Bitácora iniciada

- Inicializado git + CHANGELOG.md en este proyecto
- Convención de versionado documentada
