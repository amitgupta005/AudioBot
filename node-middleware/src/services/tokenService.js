const jwt = require('jsonwebtoken');
const config = require('../config');

const TokenService = {
  generateAccessToken(payload) {
    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  },

  generateRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
  },

  verifyAccessToken(token) {
    return jwt.verify(token, config.jwt.secret);
  },

  verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret);
  },

  generateTokenPair(user) {
    const payload = { 
      id: user._id, 
      email: user.email, 
      role: user.role,
      jobId: user.jobId || null,
      companyId: user.companyId || null
    };
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  },
};

module.exports = TokenService;
