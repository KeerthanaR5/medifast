// Role-based authorization middleware
// Usage: router.get('/admin', authenticateToken, requireRoles('admin'), handler)

function requireRoles(...allowed) {
  return (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (!allowed.includes(role)) {
        return res.status(403).json({ success: false, message: 'Insufficient role permissions' });
      }
      next();
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Authorization error' });
    }
  };
}

module.exports = { requireRoles };
