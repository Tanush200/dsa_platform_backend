const Duel = require('../models/Duel');
const DuelProblem = require('../models/DuelProblem');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const queues = {
    speed: [],
    optimization: [],
    bugfix: [],
    reverse: []
};

const socketUserMap = {};

function getRankFromElo(elo) {
    if (elo >= 2000) return 'Grandmaster';
    if (elo >= 1800) return 'Master';
    if (elo >= 1600) return 'Diamond';
    if (elo >= 1400) return 'Platinum';
    if (elo >= 1200) return 'Gold';
    if (elo >= 1000) return 'Silver';
    return 'Bronze';
}

let problemCache = {
    speed: [],
    optimization: [],
    bugfix: [],
    reverse: [],
    lastUpdated: 0
}

async function refreshCache() {
    try {
        const problems = await DuelProblem.find({ active: true }, '_id supportedModes').lean();

        const newCache = { speed: [], optimization: [], bugfix: [], reverse: [] };

        problems.forEach(p => {
            p.supportedModes.forEach(mode => {
                if (newCache[mode]) newCache[mode].push(p._id);
            })
        })

        problemCache = { ...newCache, lastUpdated: Date.now() };
    } catch (error) {
        console.error('[Duel] Cache refresh failed:', error.message);
    }
}

async function getRandomProblem(mode) {
    if (problemCache[mode].length === 0 || Date.now() - problemCache.lastUpdated > 5 * 60 * 1000) {
        await refreshCache();
    }

    const availableIds = problemCache[mode];
    if (!availableIds.length) throw new Error('No problems available for this mode');

    const randomId = availableIds[Math.floor(Math.random() * availableIds.length)];
    return await DuelProblem.findById(randomId).lean();
}

// async function getRandomProblem(mode) {
//     // const problems = await DuelProblem.find({
//     //     active: true,
//     //     supportedModes: mode
//     // });

//     const problems = await DuelProblem.aggregate([
//         { $match: { active: true, supportedModes: mode } },
//         { $sample: { size: 1 } }
//     ])
//     if (!problems.length) throw new Error('No problems available for this mode');
//     return problems[0];
// }

module.exports = function attachDuelSocket(io) {

    io.use((socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.query?.token;
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'superDsaSecretKey2026!');
            socket.userId = decoded.id;
            socket.username = decoded.username;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        // console.log(`[Duel] Connected: ${socket.username} (${socket.id})`);

        socket.on('duel:joinQueue', async ({ mode = 'speed', elo = 1000 }) => {
            const queue = queues[mode];
            if (!queue) return socket.emit('duel:error', { message: 'Invalid mode' });

            const alreadyQueued = queue.find(p => p.userId === socket.userId);
            if (alreadyQueued) return socket.emit('duel:error', { message: 'Already in queue' });

            queue.push({ userId: socket.userId, socketId: socket.id, elo, username: socket.username });
            socketUserMap[socket.id] = { userId: socket.userId, mode };

            socket.emit('duel:queued', { mode, position: queue.length });
            console.log(`[Duel] ${socket.username} joined ${mode} queue (size: ${queue.length})`);

            if (queue.length >= 2) {
                queue.sort((a, b) => a.elo - b.elo);
                const player1 = queue.shift();
                const player2 = queue.shift();

                try {
                    const problem = await getRandomProblem(mode);
                    const roomId = uuidv4();

                    const duel = new Duel({
                        players: [player1.userId, player2.userId],
                        problem: problem._id,
                        mode,
                        status: 'active',
                        startedAt: new Date(),
                        roomId
                    });
                    await duel.save();

                    const p1Socket = io.sockets.sockets.get(player1.socketId);
                    const p2Socket = io.sockets.sockets.get(player2.socketId);

                    if (p1Socket) p1Socket.join(roomId);
                    if (p2Socket) p2Socket.join(roomId);

                    const duelData = {
                        duelId: duel._id,
                        roomId,
                        mode,
                        problem: {
                            id: problem._id,
                            title: problem.title,
                            description: problem.description,
                            difficulty: problem.difficulty,
                            tags: problem.tags,
                            publicTestCases: problem.testCases.filter(tc => !tc.isHidden).map(tc => ({
                                input: tc.input,
                                expectedOutput: tc.expectedOutput
                            })),
                            ...(mode === 'bugfix' && { buggyCode: problem.buggyCode }),
                            ...(mode === 'reverse' && { reverseOutput: problem.reverseOutput }),
                            starterCode: problem.starterCode
                        },
                        players: [
                            { userId: player1.userId, username: player1.username, elo: player1.elo },
                            { userId: player2.userId, username: player2.username, elo: player2.elo }
                        ],
                        startedAt: duel.startedAt,
                        durationSeconds: 900
                    };

                    io.to(roomId).emit('duel:matched', duelData);
                    console.log(`[Duel] Match created: ${player1.username} vs ${player2.username} (${mode})`);

                    setTimeout(async () => {
                        const liveDuel = await Duel.findById(duel._id);
                        if (liveDuel && liveDuel.status === 'active') {
                            liveDuel.status = 'finished';
                            liveDuel.finishedAt = new Date();
                            await liveDuel.save();
                            io.to(roomId).emit('duel:timeUp', { duelId: duel._id });
                        }
                    }, 900 * 1000);

                } catch (err) {
                    console.error('[Duel] Match creation error:', err.message);
                    queue.unshift(player2, player1);
                    socket.emit('duel:error', { message: 'Failed to create match. Try again.' });
                }
            }
        });

        socket.on('duel:leaveQueue', ({ mode = 'speed' }) => {
            const queue = queues[mode];
            if (!queue) return;
            const idx = queue.findIndex(p => p.userId === socket.userId);
            if (idx !== -1) queue.splice(idx, 1);
            delete socketUserMap[socket.id];
            socket.emit('duel:leftQueue', { mode });
            console.log(`[Duel] ${socket.username} left ${mode} queue`);
        });

        socket.on('duel:progressUpdate', ({ roomId, attempts, testsPassed, totalTests }) => {
            socket.to(roomId).emit('duel:opponentProgress', {
                userId: socket.userId,
                username: socket.username,
                attempts,
                testsPassed,
                totalTests
            });
        });

        socket.on('duel:surrender', async ({ duelId, roomId }) => {
            try {
                const duel = await Duel.findById(duelId);
                if (!duel || duel.status !== 'active') return;

                const winnerId = duel.players.find(p => p.toString() !== socket.userId);
                const loserId = socket.userId;

                duel.winner = winnerId;
                duel.status = 'finished';
                duel.finishedAt = new Date();

                const DuelProfile = require('../models/DuelProfile');
                async function getOrCreateProfile(uid) {
                    let profile = await DuelProfile.findOne({ user: uid });
                    if (!profile) {
                        profile = new DuelProfile({ user: uid });
                        await profile.save();
                    }
                    return profile;
                }
                function calculateElo(winnerElo, loserElo, K = 32) {
                    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
                    const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
                    return {
                        winner: Math.round(winnerElo + K * (1 - expectedWinner)),
                        loser: Math.round(loserElo + K * (0 - expectedLoser))
                    };
                }

                const winnerProfile = await getOrCreateProfile(winnerId.toString());
                const loserProfile = await getOrCreateProfile(loserId.toString());

                const { winner: newWinnerElo, loser: newLoserElo } = calculateElo(winnerProfile.elo, loserProfile.elo);
                const winnerDelta = newWinnerElo - winnerProfile.elo;
                const loserDelta = newLoserElo - loserProfile.elo;

                winnerProfile.elo = newWinnerElo;
                winnerProfile.wins += 1;
                winnerProfile.currentStreak += 1;
                winnerProfile.totalDuels += 1;
                winnerProfile.bestStreak = Math.max(winnerProfile.bestStreak, winnerProfile.currentStreak);
                winnerProfile.lastDuelAt = new Date();
                await winnerProfile.save();

                loserProfile.elo = Math.max(0, newLoserElo);
                loserProfile.losses += 1;
                loserProfile.currentStreak = 0;
                loserProfile.totalDuels += 1;
                loserProfile.lastDuelAt = new Date();
                await loserProfile.save();

                duel.eloChanges = [
                    { user: winnerId, delta: winnerDelta },
                    { user: loserId, delta: loserDelta }
                ];

                await duel.save();

                io.to(roomId).emit('duel:surrendered', {
                    surrenderedBy: socket.userId,
                    winner: winnerId
                });
            } catch (err) {
                console.error("Surrender Error:", err);
                socket.emit('duel:error', { message: 'Surrender failed' });
            }
        });

        socket.on('socket:joinRoom', ({ roomId }) => {
            if (roomId) {
                socket.join(roomId);
                // console.log(`[Duel] ${socket.username} rejoined room ${roomId}`);
            }
        });

        socket.on('duel:chat', ({ roomId, message }) => {
            const sanitized = message?.trim().slice(0, 200);
            if (!sanitized) return;
            io.to(roomId).emit('duel:chatMessage', {
                userId: socket.userId,
                username: socket.username,
                message: sanitized,
                at: new Date()
            });
        });

        socket.on('duel:finished', ({ roomId }) => {
            // Tells the room (primarily the opponent) that the duel has formally ended
            // so they can fetch the final result from the database
            socket.to(roomId).emit('duel:ended');
        });

        socket.on('disconnect', () => {
            const info = socketUserMap[socket.id];
            if (info) {
                const queue = queues[info.mode];
                if (queue) {
                    const idx = queue.findIndex(p => p.userId === info.userId);
                    if (idx !== -1) queue.splice(idx, 1);
                }
                delete socketUserMap[socket.id];
            }
            // console.log(`[Duel] Disconnected: ${socket.username} (${socket.id})`);
        });
    });
};
