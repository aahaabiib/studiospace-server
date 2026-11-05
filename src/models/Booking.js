const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    studioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Studio',
      required: true,
    },
    studioTitle: { type: String, required: true },
    studioImage: { type: String, default: '' },
    studioLocation: { type: String, default: '' },
    hostEmail: { type: String, required: true },
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    hourlyRate: { type: Number, required: true },
    totalHours: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

bookingSchema.index({ studioId: 1, status: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('Booking', bookingSchema);