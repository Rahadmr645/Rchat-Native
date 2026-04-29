const { v2: cloudinary } = require('cloudinary');

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.');
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  configured = true;
}

/**
 * @param {Buffer} buffer
 * @param {{ folder: string; publicIdPrefix: string; resourceType?: 'image' | 'video' | 'auto' }} options
 * @returns {Promise<{ secureUrl: string; publicId: string }>}
 */
function uploadBuffer(buffer, options) {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: `${options.publicIdPrefix}-${Date.now()}`,
        resource_type: options.resourceType || 'image',
      },
      (err, result) => {
        if (err || !result?.secure_url || !result?.public_id) {
          reject(err || new Error('Upload failed'));
          return;
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
        });
      },
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer };
