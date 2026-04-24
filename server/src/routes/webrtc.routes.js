const express = require('express');

function buildIceServers() {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const host = process.env.TURN_SERVER_URL?.trim();
  const turnUser = process.env.TURN_USERNAME?.trim();
  const turnPass = process.env.TURN_PASSWORD?.trim();
  if (host && turnUser && turnPass) {
    const turnHost = host.includes(':') ? host : `${host}:3478`;
    const base = turnHost.startsWith('turn:') ? turnHost : `turn:${turnHost}`;
    iceServers.push({
      urls: [`${base}?transport=udp`, `${base}?transport=tcp`],
      username: turnUser,
      credential: turnPass,
    });
  }
  return { iceServers };
}

/**
 * @param {import('express').RequestHandler} authMiddleware
 */
function createWebrtcRouter(authMiddleware) {
  const r = express.Router();

  r.get('/webrtc/ice-servers', authMiddleware, (_req, res) => {
    try {
      res.json(buildIceServers());
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'ice_config_failed' });
    }
  });

  return r;
}

module.exports = { createWebrtcRouter, buildIceServers };
