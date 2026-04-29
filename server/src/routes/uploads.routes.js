const express = require('express');
const multer = require('multer');
const { uploadBuffer } = require('../services/cloudinary.js');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024,
  },
});

/**
 * @param {import('express').RequestHandler} authMiddleware
 */
function createUploadsRouter(authMiddleware) {
  const r = express.Router();

  r.post('/uploads/image', authMiddleware, upload.single('image'), async (req, res) => {
    try {
      const file = req.file;
      const threadId = typeof req.body?.threadId === 'string' ? req.body.threadId.trim() : '';
      if (!file?.buffer || !threadId) {
        res.status(400).json({ error: 'image_and_threadId_required' });
        return;
      }
      const safeThreadId = threadId.replace(/[^a-zA-Z0-9:_-]/g, '_');
      const out = await uploadBuffer(file.buffer, {
        folder: 'rchat-native/chat-images',
        publicIdPrefix: `${req.userId || 'anon'}-${safeThreadId}`,
        resourceType: 'image',
      });
      res.status(201).json({
        url: out.secureUrl,
        publicId: out.publicId,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_upload_image' });
    }
  });

  r.post('/uploads/avatar', authMiddleware, upload.single('image'), async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        res.status(400).json({ error: 'image_required' });
        return;
      }
      const uid = String(req.userId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_');
      const out = await uploadBuffer(file.buffer, {
        folder: 'rchat-native/avatars',
        publicIdPrefix: `${uid}-avatar`,
        resourceType: 'image',
      });
      res.status(201).json({
        url: out.secureUrl,
        publicId: out.publicId,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_upload_avatar' });
    }
  });

  r.post('/uploads/voice', authMiddleware, upload.single('voice'), async (req, res) => {
    try {
      const file = req.file;
      const threadId = typeof req.body?.threadId === 'string' ? req.body.threadId.trim() : '';
      if (!file?.buffer || !threadId) {
        res.status(400).json({ error: 'voice_and_threadId_required' });
        return;
      }
      const safeThreadId = threadId.replace(/[^a-zA-Z0-9:_-]/g, '_');
      const out = await uploadBuffer(file.buffer, {
        folder: 'rchat-native/chat-voice',
        publicIdPrefix: `v-${req.userId || 'anon'}-${safeThreadId}`,
        resourceType: 'video',
      });
      res.status(201).json({
        url: out.secureUrl,
        publicId: out.publicId,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed_to_upload_voice' });
    }
  });

  return r;
}

module.exports = { createUploadsRouter };
