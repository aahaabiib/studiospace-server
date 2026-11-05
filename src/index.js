const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const studioRoutes = require('./routes/studios');
const bookingRoutes = require('./routes/bookings');
const wishlistRoutes = require('./routes/wishlist');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Serverless-এ প্রতি request-এ নতুন connection না খুলে cache করা হয়
const cache = global._mongooseCache || (global._mongooseCache = { conn: null, promise: null });

async function connectDB() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGODB_URI, { dbName: 'studiospace', bufferCommands: false })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

app.use('/api/studios', studioRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/wishlist', wishlistRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'StudioSpace API is running' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Local-এ `npm run dev` দিলে server চালু হবে, Vercel-এ শুধু app export হবে
if (require.main === module) {
  connectDB()
    .then(() => {
      console.log('Connected to MongoDB');
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err.message);
      process.exit(1);
    });
}

<<<<<<< HEAD
module.exports = app;
=======
module.exports = app;
>>>>>>> e5df26a ( cache MongoDB connection and export app for serverless and vercle serverless config)
