const express = require('express');
const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// saved studios (full data)
router.get('/', verifyToken, async (req, res) => {
  try {
    const items = await Wishlist.find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .populate('studioId');
    const data = items.map((i) => i.studioId).filter(Boolean);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load wishlist' });
  }
});

// only ids (for heart state)
router.get('/ids', verifyToken, async (req, res) => {
  try {
    const items = await Wishlist.find({ userEmail: req.user.email }).select('studioId');
    res.json({ success: true, data: items.map((i) => String(i.studioId)) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load wishlist' });
  }
});

// toggle
router.post('/:studioId', verifyToken, async (req, res) => {
  try {
    const { studioId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studioId)) {
      return res.status(400).json({ success: false, message: 'Invalid studio id' });
    }
    const removed = await Wishlist.findOneAndDelete({ userEmail: req.user.email, studioId });
    if (removed) return res.json({ success: true, data: { saved: false } });

    await Wishlist.create({ userEmail: req.user.email, studioId });
    res.json({ success: true, data: { saved: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update wishlist' });
  }
});

module.exports = router;