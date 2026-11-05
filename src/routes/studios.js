const express = require('express');
const mongoose = require('mongoose');
const Studio = require('../models/Studio');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isValidId = (id) => mongoose.isValidObjectId(id);

const EDITABLE_FIELDS = [
  'title',
  'category',
  'hourlyRate',
  'securityDeposit',
  'maxCapacity',
  'location',
  'imageURL',
  'gallery',
  'amenities',
  'overview',
];

// সব studio (search, category, sort, limit)
router.get('/', async (req, res) => {
  try {
    const { category, search, sort, limit } = req.query;
    const filter = {};

    if (category && category.toLowerCase() !== 'all') filter.category = category;

    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ title: rx }, { location: rx }];
    }

    const sortMap = {
      newest: { createdAt: -1 },
      rating: { rating: -1, createdAt: -1 },
      'price-asc': { hourlyRate: 1 },
      'price-desc': { hourlyRate: -1 },
    };

    let query = Studio.find(filter).sort(sortMap[sort] || sortMap.newest);
    const n = parseInt(limit, 10);
    if (n > 0) query = query.limit(n);

    const studios = await query.exec();
    res.json({ success: true, data: studios });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Featured (৬টা)
router.get('/featured', async (req, res) => {
  try {
    const studios = await Studio.find().sort({ rating: -1, createdAt: -1 }).limit(6);
    res.json({ success: true, data: studios });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// আমার listings
router.get('/my/listings', verifyToken, async (req, res) => {
  try {
    const studios = await Studio.find({ ownerEmail: req.user.email }).sort({ createdAt: -1 });
    res.json({ success: true, data: studios });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// একটা studio
router.get('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid studio id' });
    }
    const studio = await Studio.findById(req.params.id);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    res.json({ success: true, data: studio });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// নতুন studio
router.post('/', verifyToken, async (req, res) => {
  try {
    const b = req.body;

    if (!b.title || !b.category || !b.hourlyRate || !b.location || !b.imageURL || !b.overview) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const studio = await Studio.create({
      title: b.title,
      category: b.category,
      hourlyRate: Number(b.hourlyRate),
      securityDeposit: Number(b.securityDeposit) || 0,
      maxCapacity: Number(b.maxCapacity) || 1,
      location: b.location,
      imageURL: b.imageURL,
      gallery: Array.isArray(b.gallery) ? b.gallery : [],
      amenities: Array.isArray(b.amenities) ? b.amenities : [],
      overview: b.overview,
      ownerEmail: req.user.email, // token থেকে, body থেকে না
      ownerName: req.user.name || req.user.email.split('@')[0],
    });

    res.status(201).json({ success: true, message: 'Studio added successfully', data: studio });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update (শুধু মালিক)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid studio id' });
    }
    const studio = await Studio.findById(req.params.id);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    if (studio.ownerEmail !== req.user.email) {
      return res
        .status(403)
        .json({ success: false, message: 'Forbidden: You can only update your own studios' });
    }

    const updates = {};
    EDITABLE_FIELDS.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const updated = await Studio.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: 'Studio updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete (শুধু মালিক)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid studio id' });
    }
    const studio = await Studio.findById(req.params.id);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    if (studio.ownerEmail !== req.user.email) {
      return res
        .status(403)
        .json({ success: false, message: 'Forbidden: You can only delete your own studios' });
    }

    await Studio.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Studio deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;