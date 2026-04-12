const mongoose = require('mongoose');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const Duel = require('../models/Duel');
const { redis, getJson, setJson, del } = require('../services/redis');
const { addFriendlyQuestionTimer } = require('../services/friendlyQueue');

const REDIS_FRIENDLY_PREFIX = 'friendly:duel:';

async function evaluateFriendlyAnswer(roomId, userId, selectedOptionIndex, io) {
    const room = await getJson(REDIS_FRIENDLY_PREFIX + roomId);
    if (!room || room.status !== 'active') return;

    const p = room.players[userId];
    if (!p || p.eliminated) return;

    const currentQ = room.questions[p.qIndex];
    if (!currentQ) return;

    const isCorrect = selectedOptionIndex === currentQ.correctAnswer;
    if (isCorrect) {
        p.score += 10;
    }

    const userSocket = io.sockets.sockets.get(p.socketId);
    if (userSocket) {
        userSocket.emit('friendly:roundResult', {
            isCorrect,
            correctAnswer: currentQ.correctAnswer,
            score: p.score
        });
    }

    p.qIndex += 1;

    if (p.qIndex >= room.questions.length) {
        p.finished = true;
    } else {
        setTimeout(() => {
            addFriendlyQuestionTimer(roomId, userId, p.qIndex, 20000);
            if (userSocket) {
                userSocket.emit('friendly:nextQuestion', formatQ(room.questions[p.qIndex], p.qIndex));
            }
        }, 2000);
    }

    await setJson(REDIS_FRIENDLY_PREFIX + roomId, room);

    io.to(roomId).emit('friendly:stateUpdate', {
        players: serializeFriendlyPlayers(room.players)
    });

    await checkFriendlyWinConditions(roomId, io);
}

async function checkFriendlyWinConditions(roomId, io) {
    const room = await getJson(REDIS_FRIENDLY_PREFIX + roomId);
    if (!room) return;

    const players = Object.values(room.players);
    const allFinished = players.every(p => p.finished || p.eliminated);

    if (allFinished) {
        await endFriendlyDuel(roomId, io);
    }
}

async function endFriendlyDuel(roomId, io) {
    const room = await getJson(REDIS_FRIENDLY_PREFIX + roomId);
    if (!room) return;

    const pIds = Object.keys(room.players);
    const scores = pIds.map(id => ({ id, score: room.players[id].score }));

    let winnerId = null;
    if (scores[0].score > scores[1].score) winnerId = scores[0].id;
    else if (scores[1].score > scores[0].score) winnerId = scores[1].id;

    try {
        const duel = new Duel({
            players: pIds,
            status: 'finished',
            winner: winnerId,
            mode: room.mode,
            isFriendly: true,
            finishedAt: new Date(),
            roomId: room.shortId
        });
        await duel.save();
    } catch (err) {
        console.error('[Friendly] DB Save failed:', err.message);
    }

    io.to(roomId).emit('friendly:ended', {
        winnerId,
        scores: room.scores
    });

    setTimeout(() => del(REDIS_FRIENDLY_PREFIX + roomId), 60 * 60 * 1000); // Keep for 1 hour for latecomer handles
}

function serializeFriendlyPlayers(players) {
    const result = {};
    for (const [uid, p] of Object.entries(players)) {
        result[uid] = {
            id: uid,
            username: p.username,
            score: p.score,
            qIndex: p.qIndex,
            ready: p.ready,
            finished: p.finished,
            isConnected: !!p.socketId
        };
    }
    return result;
}

function formatQ(q, index) {
    return {
        id: q._id,
        text: q.questionText,
        codeSnippet: q.codeSnippet,
        options: q.options,
        index: index,
        total: 10
    };
}

module.exports = function attachFriendlySocket(io) {
    io.on('connection', (socket) => {

        socket.on('friendly:create', async ({ mode }) => {
            const shortId = Math.random().toString(36).substr(2, 6);
            const roomId = `friendly_${shortId}`;

            const roomData = {
                id: roomId,
                shortId: shortId,
                mode: mode || 'speed',
                status: 'waiting',
                players: {
                    [socket.userId]: {
                        username: socket.username,
                        socketId: socket.id,
                        score: 0,
                        qIndex: 0,
                        ready: false,
                        finished: false
                    }
                },
                questions: [],
                inviteLink: `elix.it.com/join/${shortId}`,
                createdAt: Date.now()
            };

            await setJson(REDIS_FRIENDLY_PREFIX + roomId, roomData);
            socket.join(roomId);
            socket.emit('friendly:roomCreated', { roomId, inviteLink: roomData.inviteLink, shortId });
        });

        socket.on('friendly:join', async ({ shortId }) => {
            const roomId = `friendly_${shortId}`;
            const room = await getJson(REDIS_FRIENDLY_PREFIX + roomId);

            if (!room) return socket.emit('friendly:error', { message: "Match not found" });

            const isExpired = Date.now() - (room.createdAt || 0) > 20 * 60 * 1000;
            if (room.status === 'finished' || isExpired) {
                return socket.emit('friendly:error', { message: "expired" });
            }

            const isExisting = room.players[socket.userId];

            if (!isExisting && Object.keys(room.players).length >= 2) {
                return socket.emit('friendly:error', { message: "Room full" });
            }

            if (isExisting) {
                room.players[socket.userId].socketId = socket.id;
            } else {
                room.players[socket.userId] = {
                    username: socket.username,
                    socketId: socket.id,
                    score: 0,
                    qIndex: 0,
                    ready: false,
                    finished: false
                };
            }

            await setJson(REDIS_FRIENDLY_PREFIX + roomId, room);
            socket.join(roomId);

            io.to(roomId).emit('friendly:stateUpdate', {
                players: serializeFriendlyPlayers(room.players),
                status: room.status
            });

            if (isExisting && room.status === 'active') {
                const p = room.players[socket.userId];
                if (!p.finished && !p.eliminated) {
                    socket.emit('friendly:started', {
                        totalQuestions: 10,
                        currentQuestion: formatQ(room.questions[p.qIndex], p.qIndex),
                        rejoin: true
                    });
                }
            }
        });

        socket.on('friendly:ready', async ({ roomId }) => {
            if (!roomId) return;
            const room = await getJson(REDIS_FRIENDLY_PREFIX + roomId);
            if (!room || !room.players[socket.userId]) return;

            room.players[socket.userId].ready = true;

            const pIds = Object.keys(room.players);
            const allReady = pIds.length === 2 && pIds.every(id => room.players[id].ready);

            if (allReady) {
                room.status = 'active';
                room.questions = await SurvivalQuestion.aggregate([{ $sample: { size: 10 } }]);
                await setJson(REDIS_FRIENDLY_PREFIX + roomId, room);

                io.to(roomId).emit('friendly:started', {
                    totalQuestions: 10,
                    firstQuestion: formatQ(room.questions[0], 0)
                });

                pIds.forEach(uid => {
                    addFriendlyQuestionTimer(roomId, uid, 0, 20000);
                });
            } else {
                await setJson(REDIS_FRIENDLY_PREFIX + roomId, room);
                io.to(roomId).emit('friendly:readyUpdate', { players: serializeFriendlyPlayers(room.players) });
            }
        });

        socket.on('friendly:answer', async ({ roomId, selectedOptionIndex }) => {
            await evaluateFriendlyAnswer(roomId, socket.userId, selectedOptionIndex, io);
        });

        socket.on('disconnect', async () => {
            const rooms = Array.from(socket.rooms);
            for (const rId of rooms) {
                if (rId.startsWith('friendly_')) {
                    const room = await getJson(REDIS_FRIENDLY_PREFIX + rId);
                    if (room && room.players[socket.userId]) {
                        room.players[socket.userId].socketId = null;
                        await setJson(REDIS_FRIENDLY_PREFIX + rId, room);
                        io.to(rId).emit('friendly:stateUpdate', {
                            players: serializeFriendlyPlayers(room.players)
                        });
                    }
                }
            }
        });
    });
};

module.exports.evaluateFriendlyAnswer = evaluateFriendlyAnswer;
