/**
 * Removes all rows from `threads`, `messages`, `friend_requests`, and `friendships`.
 * Run from repo root: node server/scripts/wipeChats.js
 */
const { loadEnv } = require('../src/config/loadEnv.js');

loadEnv();
const { connectMongo } = require('../src/db/mongoClient.js');

async function main() {
  const { client, db } = await connectMongo();
  const msg = await db.collection('messages').deleteMany({});
  const thr = await db.collection('threads').deleteMany({});
  const fr = await db.collection('friend_requests').deleteMany({});
  const fs = await db.collection('friendships').deleteMany({});
  console.log(
    `Wiped chats: ${msg.deletedCount} message(s), ${thr.deletedCount} thread(s), ${fr.deletedCount} friend request(s), ${fs.deletedCount} friendship(s).`,
  );
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
