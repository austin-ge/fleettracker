// Authentication Middleware

const db = require('../database/db');

/**
 * Middleware to require authentication
 * Redirects to login page if user is not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    // API requests get JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Browser requests get redirected to login
    return res.redirect('/login.html');
  }
  next();
}

/**
 * Middleware to load user data into request
 * Attaches req.user if session exists
 */
async function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    try {
      const user = await db.getUserById(req.session.userId);
      if (user) {
        req.user = user;
      } else {
        // User was deleted, destroy session
        req.session.destroy();
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  }
  next();
}

/**
 * Middleware to redirect authenticated users away from login/register pages
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard.html');
  }
  next();
}

module.exports = {
  requireAuth,
  loadUser,
  redirectIfAuthenticated
};
