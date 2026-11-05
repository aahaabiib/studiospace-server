const express = require('express');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const Booking = require('../models/Booking');
const Studio = require('../models/Studio');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const isValidId = (id) => mongoose.isValidObjectId(id);

// ==========================================
// BOOKING LOCK CONFIGURATION
// ==========================================

const STUDIO_LOCK_MS = 2 * 60 * 1000;

// Acquire atomic lock for a studio
const acquireStudioLock = async (studioId) => {
  const token = randomUUID();
  const now = new Date();

  const lockedStudio = await Studio.findOneAndUpdate(
    {
      _id: studioId,
      $or: [
        { bookingLockUntil: { $exists: false } },
        { bookingLockUntil: null },
        { bookingLockUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        bookingLockToken: token,
        bookingLockUntil: new Date(
          now.getTime() + STUDIO_LOCK_MS
        ),
      },
    },
    {
      new: true,
    }
  );

  return lockedStudio ? token : null;
};

// Release lock safely
const releaseStudioLock = async (studioId, token) => {
  if (!token) return;

  await Studio.updateOne(
    {
      _id: studioId,
      bookingLockToken: token,
    },
    {
      $set: {
        bookingLockToken: null,
        bookingLockUntil: null,
      },
    }
  );
};

// ==========================================
// CHECK BOOKING TIME CONFLICT
// ==========================================

const findConflict = (studioId, start, end, excludeId) => {
  const query = {
    studioId,
    status: 'Confirmed',

    startTime: {
      $lt: end,
    },

    endTime: {
      $gt: start,
    },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Booking.findOne(query);
};

// ==========================================
// CREATE NEW BOOKING
// POST /api/bookings
// ==========================================

router.post('/', verifyToken, async (req, res) => {
  let lockToken = null;
  let studioIdForRelease = null;

  try {
    const { studioId, startTime, endTime } = req.body;

    // Validate required fields
    if (!studioId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Studio, start time and end time are required',
      });
    }

    if (!isValidId(studioId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid studio id',
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date or time',
      });
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

    // Acquire studio lock
    studioIdForRelease = studioId;

    lockToken = await acquireStudioLock(studioId);

    if (!lockToken) {
      return res.status(409).json({
        success: false,
        code: 'STUDIO_BOOKING_BUSY',
        message:
          'This studio is processing another booking. Please try again in a moment.',
      });
    }

    // Fetch studio after acquiring lock
    const studio = await Studio.findById(studioId);

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: 'Studio not found',
      });
    }

    // Prevent owner from booking own studio
    if (studio.ownerEmail === req.user.email) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own studio',
      });
    }

    // Check overlapping confirmed bookings
    const conflict = await findConflict(
      studioId,
      start,
      end
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        code: 'BOOKING_TIME_CONFLICT',
        message:
          'This time slot conflicts with an existing confirmed booking. Please choose another time.',
      });
    }

    // Calculate price on server
    const totalHours =
      Math.round(
        ((end - start) / (1000 * 60 * 60)) * 100
      ) / 100;

    const totalPrice =
      Math.round(
        totalHours * studio.hourlyRate * 100
      ) / 100;

    // Create pending booking
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

    return res.status(201).json({
      success: true,
      message: 'Booking request sent successfully',
      data: booking,
    });

  } catch (error) {
    console.error('Create booking error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to create booking right now',
    });

  } finally {
    // Always release lock
    if (lockToken) {
      try {
        await releaseStudioLock(
          studioIdForRelease,
          lockToken
        );
      } catch (releaseError) {
        console.error(
          'Could not release studio booking lock:',
          releaseError
        );
      }
    }
  }
});

// ==========================================
// GET MY BOOKINGS
// GET /api/bookings/my
// ==========================================

router.get('/my', verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({
      userEmail: req.user.email,
    }).sort({
      createdAt: -1,
    });

    return res.json({
      success: true,
      data: bookings,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// GET HOST BOOKINGS
// GET /api/bookings/host
// ==========================================

router.get('/host', verifyToken, async (req, res) => {
  try {
    const bookings = await Booking.find({
      hostEmail: req.user.email,
    }).sort({
      createdAt: -1,
    });

    return res.json({
      success: true,
      data: bookings,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// GET CONFIRMED BOOKING SLOTS
// GET /api/bookings/slots/:studioId
// ==========================================

router.get('/slots/:studioId', async (req, res) => {
  try {
    const { studioId } = req.params;

    if (!isValidId(studioId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid studio id',
      });
    }

    const query = {
      studioId,
      status: 'Confirmed',
    };

    const from = new Date(req.query.from);
    const to = new Date(req.query.to);

    if (
      !isNaN(from.getTime()) &&
      !isNaN(to.getTime())
    ) {
      query.startTime = {
        $lt: to,
      };

      query.endTime = {
        $gt: from,
      };
    }

    const slots = await Booking.find(query)
      .select('startTime endTime')
      .sort({
        startTime: 1,
      });

    return res.json({
      success: true,
      data: slots,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// CANCEL PENDING BOOKING
// PATCH /api/bookings/:id/cancel
// ==========================================

router.patch('/:id/cancel', verifyToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking id',
      });
    }

    const booking = await Booking.findById(
      req.params.id
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }

    if (booking.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending bookings can be cancelled',
      });
    }

    booking.status = 'Cancelled';

    await booking.save();

    return res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// UPDATE BOOKING STATUS (HOST)
// PATCH /api/bookings/:id/status
// ==========================================

router.patch('/:id/status', verifyToken, async (req, res) => {
  let lockToken = null;
  let studioIdForRelease = null;

  try {
    const { status } = req.body;

    if (
      !['Confirmed', 'Completed', 'Cancelled'].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking id',
      });
    }

    // Find initial booking
    const initialBooking = await Booking.findById(
      req.params.id
    );

    if (!initialBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (initialBooking.hostEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'Only the studio host can change this status',
      });
    }

    // Acquire lock for this studio
    studioIdForRelease = initialBooking.studioId;

    lockToken = await acquireStudioLock(
      studioIdForRelease
    );

    if (!lockToken) {
      return res.status(409).json({
        success: false,
        code: 'STUDIO_BOOKING_BUSY',
        message:
          'This studio is processing another booking. Please try again in a moment.',
      });
    }

    // Re-fetch booking after acquiring lock
    const booking = await Booking.findById(
      req.params.id
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    if (booking.hostEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'Only the studio host can change this status',
      });
    }

    // Allowed status transitions
    const allowedFrom = {
      Confirmed: ['Pending'],
      Completed: ['Confirmed'],
      Cancelled: ['Pending', 'Confirmed'],
    };

    if (!allowedFrom[status].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message:
          `A ${booking.status.toLowerCase()} booking cannot be marked as ${status.toLowerCase()}`,
      });
    }

    // Check conflict before confirming
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
          code: 'BOOKING_TIME_CONFLICT',
          message:
            'Another confirmed booking already overlaps with this time slot.',
        });
      }
    }

    // Conditional update prevents stale status updates
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: booking.status,
      },
      {
        $set: {
          status,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedBooking) {
      return res.status(409).json({
        success: false,
        message:
          'Booking status changed. Please refresh and try again.',
      });
    }

    return res.json({
      success: true,
      message: `Booking ${status.toLowerCase()}`,
      data: updatedBooking,
    });

  } catch (error) {
    console.error('Update booking status error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to update booking right now',
    });

  } finally {
    // Always release lock
    if (lockToken) {
      try {
        await releaseStudioLock(
          studioIdForRelease,
          lockToken
        );
      } catch (releaseError) {
        console.error(
          'Could not release studio booking lock:',
          releaseError
        );
      }
    }
  }
});

module.exports = router;
