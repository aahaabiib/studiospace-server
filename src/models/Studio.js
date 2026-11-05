const mongoose = require('mongoose');

const studioSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Photo Studio',
        'Film Stage',
        'Podcast Lounge',
        'Music Suite',
        'Workshop',
        'Art Workshop',
        'Sound Stage',
      ],
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    securityDeposit: {
      type: Number,
      required: true,
      min: 0,
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
    },
    location: {
      type: String,
      required: true,
    },
    imageURL: {
      type: String,
      required: true,
    },
    amenities: [
      {
        type: String,
      },
    ],
    gallery: [{ type: [String], default: [] }],
    reviews: [
      {
        userName: String,
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    overview: {
      type: String,
      required: true,
    },
    ownerEmail: {
      type: String,
      required: true,
    },
    ownerName: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      default: 4.5,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Studio', studioSchema);