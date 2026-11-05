const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, index: true },
    studioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Studio', required: true },
  },
  { timestamps: true }
);

wishlistSchema.index({ userEmail: 1, studioId: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);