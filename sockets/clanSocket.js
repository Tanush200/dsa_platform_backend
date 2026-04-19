const ClanMessage = require('../models/ClanMessage');
const User = require('../models/User');

module.exports = (io) => {
    io.on('connection', (socket) => {

        socket.on('clan:join', async ({ clanId }) => {
            if (!clanId) return;
            socket.join(`clan:${clanId}`);
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
