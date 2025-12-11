const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT authentication middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      maxAge: '1h'
    });
    req.user = decoded;
    next();
  } catch (err) {
    const errorMessage = err.name === 'TokenExpiredError' 
      ? 'Token expired' 
      : 'Invalid token';
    res.status(403).json({ error: errorMessage });
  }
}

module.exports = { authenticate };