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
const compression = require('compression');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');


dotenv.config();

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

const baseOrigins = ["https://dsa-platform-frontend-nu.vercel.app", "https://elix.it.com", "https://www.elix.it.com"];
const allowedOrigins = process.env.CORS_ORIGINS
  ? [...new Set([...process.env.CORS_ORIGINS.split(',').map(o => o.trim()), ...baseOrigins])]
  : baseOrigins;

logger.info({ allowedOrigins }, "CORS configuration initialized");


const requiredEnv = ['JWT_SECRET', 'MONGODB_URI', 'REDIS_URL'];
const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length > 0) {
  logger.fatal(`FATAL: Missing critical environment variables: ${missing.join(', ')}. Server induction aborted.`);
  process.exit(1);
}



const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? allowedOrigins
      : '*',
    credentials: true
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

global.io = io;


const botPatterns = [
  /\.php$/, /\.env$/, /\.sql$/, /\.aspx$/, /^\/actuator/,
  /^\/wp-/, /^\/backup/, /^\/_profiler/, /^\/config/,
  /^\/owa/, /^\/auth/, /^\/admin/, /^\/web-console/,
  /^\/invoker/, /^\/jmx-console/
];


app.use(pinoHttp({
  logger,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      remoteAddress: req.remoteAddress,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => 
          !['authorization', 'cookie', 'x-forwarded-for', 'x-real-ip', 'connection', 'accept-encoding', 'upgrade-insecure-requests'].includes(key)
        )
      )
    }),
    res: (res) => {
      const headers = (typeof res.getHeaders === 'function') ? res.getHeaders() : (res.headers || res._headers || {});
      return {
        statusCode: res.statusCode,
        headers: Object.fromEntries(
          Object.entries(headers).filter(([key]) => 
            !['strict-transport-security', 'x-content-type-options', 'x-dns-prefetch-control', 
              'x-download-options', 'x-frame-options', 'x-permitted-cross-domain-policies', 
              'x-xss-protection', 'vary', 'access-control-allow-credentials', 'etag', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'].includes(key)
          )
        )
      };
    }

  },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  autoLogging: {
    ignore: (req) => botPatterns.some(p => p.test(req.path))
  },
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'silent';
  }
}));

app.use(compression());
app.use(helmet());


const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5000,
  message: { status: 'fail', message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
});
app.use('/api/', globalLimiter);


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { status: 'fail', message: 'Too many authentication attempts, please try again in 15 minutes' },
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
          logger.warn({ origin }, "CORS REJECTED: Unauthorized origin attempt");
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
app.use('/api/referral', noCache, require('./routes/referral'));
app.use('/api/clan', require('./routes/clan'));


app.all('/*path', (req, res) => {
  const isBot = botPatterns.some(p => p.test(req.path));
  if (!isBot) {
    logger.warn(`🔍 404 Attempted access to non-existent route: ${req.originalUrl}`);
  }
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

// Error handling middleware
app.use(errorHandler);


try {
  const pubClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  });
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on("error", (err) => logger.error(`Redis Pub Error: ${err.message}`));
  subClient.on("error", (err) => logger.error(`Redis Sub Error: ${err.message}`));

  logger.info("Redis Connection Initialized");
} catch (err) {
  logger.error(err, "CRITICAL: Failed to initialize Redis adapter. Survival mode will be disabled.");
}

//  Socket Handlers
const attachDuelSocket = require('./sockets/duelSocket');
attachDuelSocket(io);

const attachSurvivalSocket = require('./sockets/survivalSocket');
attachSurvivalSocket(io);

const attachFriendlySocket = require('./sockets/friendlySocket');
attachFriendlySocket(io);

const attachClanSocket = require('./sockets/clanSocket');
attachClanSocket(io);

require('./workers/survivalWorker');
require('./workers/friendlyWorker');
require('./workers/clanResetWorker');


mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 50,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error(err, 'MongoDB connection error:'));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});


process.on('uncaughtException', (err) => {
  logger.fatal(err, '💥 UNCAUGHT EXCEPTION! Shutting down...');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.fatal(err, '💥 UNHANDLED REJECTION! Shutting down...');
  process.exit(1);
});
