const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');


dotenv.config();

const app = express();
const server = http.createServer(app);

// Trust Cloudflare proxy (essential for rate-limiting to find real IP)
app.set('trust proxy', 1);

const baseOrigins = ["https://dsa-platform-frontend-nu.vercel.app", "https://elix.it.com", "https://www.elix.it.com"];
const allowedOrigins = process.env.CORS_ORIGINS
  ? [...new Set([...process.env.CORS_ORIGINS.split(',').map(o => o.trim()), ...baseOrigins])]
  : baseOrigins;

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error("FATAL: JWT_SECRET environment variable is missing.");
  process.exit(1);
}



const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? allowedOrigins
      : '*',
    credentials: true
  }
});

global.io = io;


app.use(helmet());


const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: { status: 'fail', message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);


const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { status: 'fail', message: 'Too many authentication attempts, please try again in an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV === "production") {
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.error(`💥 CORS REJECTED: Origin "${origin}" is not in allowed list:`, allowedOrigins);
          callback(new Error("Not allowed by CORS"));
        }
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));



app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Elite Syntax Backend is running successfully',
    timestamp: new Date().toISOString()
  });
});



app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/problems', require('./routes/problems'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/interview', require('./routes/interview'));
app.use('/api/duel', require('./routes/duel'));
app.use('/api/survival', require('./routes/survival'));


try {
  const pubClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  });
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on("error", (err) => console.error("Redis Pub Error:", err.message));
  subClient.on("error", (err) => console.error("Redis Sub Error:", err.message));

  console.log("Redis Connection Initialized");
} catch (err) {
  console.error("CRITICAL: Failed to initialize Redis adapter. Survival mode will be disabled.", err.message);
}

const attachDuelSocket = require('./sockets/duelSocket');
attachDuelSocket(io);

const attachSurvivalSocket = require('./sockets/survivalSocket');
attachSurvivalSocket(io);

require('./workers/survivalWorker');


mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down...', err.name, ':', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down...', err.name, ':', err.message);
  console.error(err.stack);
  process.exit(1);
});
