const path = require('path');
const dotenv = require('dotenv');

/**
 * Load `server/.env` once (safe to call multiple times).
 */
function loadEnv() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
}

module.exports = { loadEnv };
