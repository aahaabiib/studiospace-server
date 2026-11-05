const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  try {
    const token = req.cookies?.studio_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: please login first',
      });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET); // { email, name }
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: invalid or expired token',
    });
  }
};

module.exports = { verifyToken };