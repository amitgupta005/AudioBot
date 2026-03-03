const jwt = require('jsonwebtoken');
const config = require('../config');

const signToken = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn });

const verifyToken = (token, secret) => {
  try {
    return { valid: true, payload: jwt.verify(token, secret) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

const jwtService = {
  generateTokens(user) {
    const payload = { id: user._id, email: user.email, role: user.role };
    const accessToken = signToken(payload, config.jwt.secret, config.jwt.expiresIn);
    const refreshToken = signToken(
      { id: user._id },
      config.jwt.refreshSecret,
      config.jwt.refreshExpiresIn
    );
    return { accessToken, refreshToken };
  },

  verifyAccess(token) {
    return verifyToken(token, config.jwt.secret);
  },

  verifyRefresh(token) {
    return verifyToken(token, config.jwt.refreshSecret);
  },

  extractFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  },
};

module.exports = jwtService;
