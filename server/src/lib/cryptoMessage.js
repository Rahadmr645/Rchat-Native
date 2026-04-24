const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKeyBuffer() {
  const hex = process.env.MESSAGE_CIPHER_KEY;
  if (!hex || typeof hex !== 'string') {
    throw new Error(
      'Set MESSAGE_CIPHER_KEY in server/.env to 64 hex characters (32 bytes). Example: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const key = Buffer.from(hex.trim(), 'hex');
  if (key.length !== 32) {
    throw new Error('MESSAGE_CIPHER_KEY must be exactly 64 hex characters (32 bytes).');
  }
  return key;
}

/**
 * Encrypt UTF-8 message for storage. Raw text never hits the database.
 * @param {string} plainText
 */
function encryptText(plainText) {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    cipher: ciphertext.toString('base64'),
  };
}

/**
 * @param {{ iv: string, tag: string, cipher: string }} stored
 */
function decryptText(stored) {
  const key = getKeyBuffer();
  const iv = Buffer.from(stored.iv, 'base64');
  const tag = Buffer.from(stored.tag, 'base64');
  const data = Buffer.from(stored.cipher, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encryptText, decryptText };
