const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = ["https://dsa-platform-frontend-nu.vercel.app"];

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? allowedOrigins
      : '*',
    credentials: true
  }
});

app.use(cookieParser());
app.use(
  cors({
    origin: function (origin, callback) {
      if (process.env.NODE_ENV === "production") {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);
app.use(express.json());



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



const attachDuelSocket = require('./sockets/duelSocket');
attachDuelSocket(io);

const attachSurvivalSocket = require('./sockets/survivalSocket');
attachSurvivalSocket(io);


mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
