const { MongoClient } = require('mongodb');

const DEFAULT_DB = 'rchat';

/**
 * @returns {Promise<{ client: import('mongodb').MongoClient, db: import('mongodb').Db }>}
 */
async function connectMongo() {
  const url = process.env.MONGO_URL;
  if (!url || typeof url !== 'string') {
    throw new Error('Set MONGO_URL in server/.env to your MongoDB connection string.');
  }
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(DEFAULT_DB);
  return { client, db };
}

module.exports = { connectMongo, DEFAULT_DB };
