const ClanMessage = require('../models/ClanMessage');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = (io) => {

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error('Authentication required for secure comms.'));

            const secret = process.env.JWT_SECRET;
            const decoded = jwt.verify(token, secret);

            socket.userId = decoded.id;
            next();
        } catch (err) {
            next(new Error('Invalid tactical token. Transmission rejected.'));
        }
    });

    io.on('connection', (socket) => {

        socket.on('clan:join', async ({ clanId }) => {
            if (!clanId || !socket.userId) return;

            if (!mongoose.Types.ObjectId.isValid(clanId)) {
                return socket.emit('clan:error', { message: 'Malformed sector coordinates.' });
            }

            try {
                const user = await User.findById(socket.userId).select('clanId');
                if (!user || !user.clanId || user.clanId.toString() !== clanId) {
                    console.warn(`[Comms Intrusion Alert] User ${socket.userId} attempted to listen in on Clan ${clanId}`);
                    return socket.emit('clan:error', { message: 'Unauthorized sector access. Comms isolation active.' });
                }

                socket.join(`clan:${clanId}`);
            } catch (err) {
                socket.emit('clan:error', { message: 'Strategic coupling failed.' });
            }
        });

        socket.on('clan:sendMessage', async ({ clanId, content }) => {
            const userId = socket.userId;
            if (!clanId || !userId || !content) return;

            try {
                const user = await User.findById(userId).select('username nickname clanId');

                if (!user.clanId || user.clanId.toString() !== clanId.toString()) {
                    console.error(`[Comms Breach Attempt] User ${userId} attempted transmission to unauthorized sector ${clanId}`);
                    return socket.emit('clan:error', { message: 'Unauthorized sector. Transmission rejected.' });
                }


                const sanitizedContent = content
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');

                const message = new ClanMessage({
                    clanId,
                    senderId: userId,
                    content: sanitizedContent
                });
                await message.save();

                const messagePayload = {
                    _id: message._id,
                    clanId,
                    senderId: {
                        _id: userId,
                        username: user.username,
                        nickname: user.nickname
                    },
                    content: sanitizedContent,
                    timestamp: message.timestamp
                };

                io.to(`clan:${clanId}`).emit('clan:messageReceived', messagePayload);

            } catch (err) {
                console.error('[Clan Socket] Transmission failure:', err);
                socket.emit('clan:error', { message: 'Strategic transmission failed.' });
            }
        });

        socket.on('clan:leave', ({ clanId }) => {
            socket.leave(`clan:${clanId}`);
        });
    });
};
