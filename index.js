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
const morgan = require('morgan');
const compression = require('compression');


dotenv.config();

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

const baseOrigins = ["https://dsa-platform-frontend-nu.vercel.app", "https://elix.it.com", "https://www.elix.it.com"];
const allowedOrigins = process.env.CORS_ORIGINS
  ? [...new Set([...process.env.CORS_ORIGINS.split(',').map(o => o.trim()), ...baseOrigins])]
  : baseOrigins;

console.log("Allowed Origins: ", allowedOrigins);


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


const botPatterns = [
  /\.php$/, /\.env$/, /\.sql$/, /\.aspx$/, /^\/actuator/,
  /^\/wp-/, /^\/backup/, /^\/_profiler/, /^\/config/,
  /^\/owa/, /^\/auth/, /^\/admin/, /^\/web-console/,
  /^\/invoker/, /^\/jmx-console/
];


app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  skip: (req) => botPatterns.some(p => p.test(req.path))
}));
app.use(compression());
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
  limit: 1000,
  message: { status: 'fail', message: 'Too many authentication attempts, please try again in an hour' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
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
          callback(new Error(`CORS policy: This origin '${origin}' is not allowed.`));
        }
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    maxAge: 86400,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));


// Cache management - handled by individual routers or specifically grouped below
const { noCache } = require('./middleware/cache');



app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Elite Syntax Backend is running successfully',
    timestamp: new Date().toISOString()
  });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/robots.txt', (req, res) => res.type('text/plain').send("User-agent: *\nAllow: /"));
app.get('/', (req, res) => res.status(200).send("Elite Syntax API - Secure & Healthy"));



app.use('/api/auth', noCache, require('./routes/auth'));
app.use('/api/user', noCache, require('./routes/user'));
app.use('/api/problems', require('./routes/problems'));
app.use('/api/progress', noCache, require('./routes/progress'));
app.use('/api/settings', noCache, require('./routes/settings'));
app.use('/api/interview', noCache, require('./routes/interview'));
app.use('/api/duel', require('./routes/duel'));
app.use('/api/survival', require('./routes/survival'));


app.all('/*path', (req, res) => {
  const isBot = botPatterns.some(p => p.test(req.path));
  if (!isBot) {
    console.log(`🔍 404 Attempted access to non-existent route: ${req.originalUrl}`);
  }
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});


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

// 📡 Socket Handlers
const attachDuelSocket = require('./sockets/duelSocket');
attachDuelSocket(io);

const attachSurvivalSocket = require('./sockets/survivalSocket');
attachSurvivalSocket(io);

const attachFriendlySocket = require('./sockets/friendlySocket');
attachFriendlySocket(io);

require('./workers/survivalWorker');
require('./workers/friendlyWorker');


mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
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
