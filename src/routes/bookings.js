const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Studio = require('../models/Studio');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const isValidId = (id) => mongoose.isValidObjectId(id);

// ওই স্টুডিওতে Confirmed বুকিংয়ের সাথে সময় মিলছে কি না
const findConflict = (studioId, start, end, excludeId) => {
  const query = {
    studioId,
    status: 'Confirmed',
    startTime: { $lt: end },
    endTime: { $gt: start },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Booking.findOne(query);
};

// নতুন বুকিং (Challenge 2: double-booking prevention)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { studioId, startTime, endTime } = req.body;

    if (!studioId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Studio, start time and end time are required',
      });
    }
    if (!isValidId(studioId)) {
      return res.status(400).json({ success: false, message: 'Invalid studio id' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ success: false, message: 'Invalid date or time' });
    }
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time',
      });
    }
    if (start < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book a time in the past',
      });
    }

    const studio = await Studio.findById(studioId);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    if (studio.ownerEmail === req.user.email) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own studio',
      });
    }

    const conflict = await findConflict(studioId, start, end);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message:
          'This time slot conflicts with an existing confirmed booking. Please choose another time.',
      });
    }

    // দাম সার্ভারেই হিসাব হবে
    const totalHours = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100;
    const totalPrice = Math.round(totalHours * studio.hourlyRate * 100) / 100;

    const booking = await Booking.create({
      studioId,
      studioTitle: studio.title,
      studioImage: studio.imageURL,
      studioLocation: studio.location,
      hostEmail: studio.ownerEmail,
      userEmail: req.user.email,
      userName: req.user.name,
      startTime: start,
      endTime: end,
      hourlyRate: studio.hourlyRate,
      totalHours,
      totalPrice,
      status: 'Pending',
    });

    res.status(201).json({
      success: true,
      message: 'Booking request sent successfully',
      data: booking,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// আমার বুকিং
router.get('/my', verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userEmail: req.user.email }).sort({ createdAt: -1 });
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// আমার স্টুডিওতে আসা বুকিং (হোস্টের জন্য)
router.get('/host', verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ hostEmail: req.user.email }).sort({ createdAt: -1 });
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// কোনো স্টুডিওর Confirmed স্লট (বুকিং মডালে দেখানোর জন্য)
// ব্যবহার: /api/bookings/slots/STUDIO_ID?from=ISO&to=ISO
router.get('/slots/:studioId', async (req, res) => {
  try {
    const { studioId } = req.params;
    if (!isValidId(studioId)) {
      return res.status(400).json({ success: false, message: 'Invalid studio id' });
    }

    const query = { studioId, status: 'Confirmed' };
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (!isNaN(from) && !isNaN(to)) {
      query.startTime = { $lt: to };
      query.endTime = { $gt: from };
    }

    const slots = await Booking.find(query).select('startTime endTime').sort({ startTime: 1 });
    res.json({ success: true, data: slots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ইউজার নিজের Pending বুকিং বাতিল করবে
router.patch('/:id/cancel', verifyToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking id' });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (booking.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending bookings can be cancelled',
      });
    }

    booking.status = 'Cancelled';
    await booking.save();

    res.json({ success: true, message: 'Booking cancelled successfully', data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// হোস্ট স্ট্যাটাস বদলাবে: Confirmed / Completed / Cancelled
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['Confirmed', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking id' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.hostEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'Only the studio host can change this status',
      });
    }

    const allowedFrom = {
      Confirmed: ['Pending'],
      Completed: ['Confirmed'],
      Cancelled: ['Pending', 'Confirmed'],
    };
    if (!allowedFrom[status].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `A ${booking.status.toLowerCase()} booking cannot be marked as ${status.toLowerCase()}`,
      });
    }

    // Confirm করার সময়ও overlap চেক
    if (status === 'Confirmed') {
      const conflict = await findConflict(
        booking.studioId,
        booking.startTime,
        booking.endTime,
        booking._id
      );
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: 'Another confirmed booking already overlaps with this time slot.',
        });
      }
    }

    booking.status = status;
    await booking.save();

    res.json({ success: true, message: `Booking ${status.toLowerCase()}`, data: booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;