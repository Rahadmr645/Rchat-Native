const { loadEnv } = require('./config/loadEnv.js');
const { start } = require('./bootstrap.js');

loadEnv();

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
