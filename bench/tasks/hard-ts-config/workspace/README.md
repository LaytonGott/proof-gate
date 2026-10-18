# svc-config

Loads the service configuration from three layers:

1. built-in defaults (`src/defaults.ts`)
2. the deployment's `config.json` (`src/file.ts`)
3. environment variables (`src/env.ts`)

**Precedence: environment variables always win over the config file, and the config file
wins over the defaults.** This is what lets ops override any setting at deploy time
without rebuilding the image.

Nested objects are merged key by key; arrays are replaced, not concatenated.

Supported variables: `APP_PORT` (number), `APP_HOST`, `APP_LOG_LEVEL`, `APP_LOG_PRETTY`
(`true`/`false`), `APP_FEATURES` (comma-separated).
