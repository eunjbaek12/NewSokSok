// Dynamic config — overrides googleServicesFile with EAS file env var when present.
// Local dev: falls back to ./google-services.json (file on disk, not in git).
// EAS Build: set GOOGLE_SERVICES_JSON as a file secret env var.
const { expo } = require('./app.json');

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  ...expo,
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
};
