const SurvivalDuel = require('../models/SurvivalDuel');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const DuelProfile = require('../models/DuelProfile');
const { v4: uuidv4 } = require('uuid');

const queue = [];
const activeDuels = {};
const TIME_PER_QUESTION = 20000;
const DUEL_MAX_TIME = 180000;


const RANK_DIFFICULTY = {
    Recruit: ['Easy'],
    Survivor: ['Easy', 'Medium'],
    Fighter: ['Medium'],
    Warrior: ['Medium', 'Hard'],
    Champion: ['Hard'],
    Legend: ['Hard'],
};

async function getQuestionsForRank(rank, count = 50, excludeIds = []) {
    const difficulties = RANK_DIFFICULTY[rank] || ['Easy'];
    return await SurvivalQuestion.aggregate([
        {
            $match: {
                active: true,
                difficulty: { $in: difficulties },
                _id: { $nin: excludeIds }
            }
        },
        { $sample: { size: count } }
    ]);
}

function serializePlayers(players) {
    const result = {};
    for (const [uid, p] of Object.entries(players)) {
        result[uid] = {
            username: p.username,
            points: p.points,
            streak: p.streak,
            lives: p.lives,
            eliminated: p.eliminated,
            qIndex: p.qIndex
        };
    }
    return result;
}

async function getRandomQuestions(count = 50) {
    return await SurvivalQuestion.aggregate([
        { $match: { active: true } },
        { $sample: { size: count } }
    ]);
}

module.exports = function attachSurvivalSocket(io) {
    io.on('connection', (socket) => {
        if (!socket.userId) return;


        socket.on('survival:joinQueue', () => {
            const alreadyInQueue = queue.find(p => p.userId === socket.userId);
            if (alreadyInQueue) return;

            queue.push({ userId: socket.userId, socketId: socket.id, username: socket.username });
            socket.emit('survival:queued', { position: queue.length });

            if (queue.length >= 2) {
                const p1 = queue.shift();
                const p2 = queue.shift();
                startSurvivalDuel(p1, p2);
            }
        });

        socket.on('survival:leaveQueue', () => {
            const idx = queue.findIndex(p => p.userId === socket.userId);
            if (idx !== -1) queue.splice(idx, 1);
        });

        socket.on('survival:reconnect', ({ roomId }) => {
            const duel = activeDuels[roomId];
            if (!duel) return;
            const p = duel.players[socket.userId];
            if (!p) return;

            p.socketId = socket.id;
            socket.join(roomId);


            io.to(socket.id).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

            if (!p.eliminated) {
                const q = p.questions && p.questions[p.qIndex];
                if (q) {
                    io.to(socket.id).emit('survival:question', {
                        index: p.qIndex,
                        questionText: q.questionText,
                        codeSnippet: q.codeSnippet,
                        options: q.options,
                        type: q.type,
                        difficulty: q.difficulty,
                        points: q.points,
                        timeLimit: TIME_PER_QUESTION
                    });
                }
            }
        });

        async function startSurvivalDuel(p1, p2) {
            try {
                const roomId = uuidv4();
                const duel = new SurvivalDuel({
                    roomId,
                    players: [
                        { user: p1.userId, points: 0, streak: 0, eliminated: false },
                        { user: p2.userId, points: 0, streak: 0, eliminated: false }
                    ],
                    status: 'active',
                    startedAt: new Date()
                });
                await duel.save();

                const [prof1, prof2] = await Promise.all([
                    DuelProfile.findOne({ user: p1.userId }),
                    DuelProfile.findOne({ user: p2.userId })
                ]);

                const rank1 = prof1?.survivalRank || 'Recruit';
                const rank2 = prof2?.survivalRank || 'Recruit';

                let exclude1 = prof1?.survivalSeenQuestions || [];
                let exclude2 = prof2?.survivalSeenQuestions || [];

                const diffs1 = RANK_DIFFICULTY[rank1];
                const avail1 = await SurvivalQuestion.countDocuments({ active: true, difficulty: { $in: diffs1 }, _id: { $nin: exclude1 } });
                if (avail1 < 60) {
                    await DuelProfile.updateOne({ user: p1.userId }, { $set: { survivalSeenQuestions: [] } });
                    exclude1 = [];
                }

                const diffs2 = RANK_DIFFICULTY[rank2];
                const avail2 = await SurvivalQuestion.countDocuments({ active: true, difficulty: { $in: diffs2 }, _id: { $nin: exclude2 } });
                if (avail2 < 60) {
                    await DuelProfile.updateOne({ user: p2.userId }, { $set: { survivalSeenQuestions: [] } });
                    exclude2 = [];
                }

                const [questions1, questions2] = await Promise.all([
                    getQuestionsForRank(rank1, 60, exclude1),
                    getQuestionsForRank(rank2, 60, exclude2)
                ]);

                const p1Socket = io.sockets.sockets.get(p1.socketId);
                const p2Socket = io.sockets.sockets.get(p2.socketId);

                if (p1Socket) p1Socket.join(roomId);
                if (p2Socket) p2Socket.join(roomId);

                const globalTimerEnd = Date.now() + DUEL_MAX_TIME + 3000;

                activeDuels[roomId] = {
                    roomId,
                    duelId: duel._id,
                    globalTimerEnd,
                    players: {
                        [p1.userId]: { username: p1.username, points: 0, streak: 0, lives: 4, eliminated: false, socketId: p1.socketId, qIndex: 0, questions: questions1, rank: rank1 },
                        [p2.userId]: { username: p2.username, points: 0, streak: 0, lives: 4, eliminated: false, socketId: p2.socketId, qIndex: 0, questions: questions2, rank: rank2 }
                    },
                };

                io.to(roomId).emit('survival:matched', {
                    roomId,
                    duelId: duel._id.toString(),
                    players: [p1.username, p2.username],
                    globalTimerEnd,
                    ranks: { [p1.userId]: rank1, [p2.userId]: rank2 }
                });

                activeDuels[roomId].globalTimer = setTimeout(() => handleTimeOut(roomId), DUEL_MAX_TIME + 3000);

                setTimeout(() => {
                    nextQuestion(roomId, p1.userId);
                    nextQuestion(roomId, p2.userId);
                }, 3000);

            } catch (err) {
                console.error("Match creation error:", err);
            }
        }


        function handleTimeOut(roomId) {
            const duel = activeDuels[roomId];
            if (!duel) return;

            const playerIds = Object.keys(duel.players);
            playerIds.forEach(uid => {
                const p = duel.players[uid];
                if (p.timer) clearTimeout(p.timer);
            });

            const p1 = duel.players[playerIds[0]];
            const p2 = duel.players[playerIds[1]];

            let winnerId = null;
            if (p1.points > p2.points) winnerId = playerIds[0];
            else if (p2.points > p1.points) winnerId = playerIds[1];
            else if (p1.streak > p2.streak) winnerId = playerIds[0];
            else if (p2.streak > p1.streak) winnerId = playerIds[1];

            endDuel(roomId, winnerId);
        }

        function nextQuestion(roomId, userId) {
            const duel = activeDuels[roomId];
            if (!duel) return;

            const p = duel.players[userId];
            if (!p || p.eliminated) return;

            const q = p.questions && p.questions[p.qIndex];
            if (!q) {

                p.eliminated = true;
                checkWinConditions(roomId);
                return;
            }

            p.isProcessing = false;

            io.to(roomId).emit('survival:stateUpdate', {
                players: serializePlayers(duel.players),
                globalTimerEnd: duel.globalTimerEnd
            });


            io.to(p.socketId).emit('survival:question', {
                index: p.qIndex,
                questionText: q.questionText,
                codeSnippet: q.codeSnippet,
                options: q.options,
                type: q.type,
                difficulty: q.difficulty,
                points: q.points,
                timeLimit: TIME_PER_QUESTION
            });

            if (p.timer) clearTimeout(p.timer);


            p.timer = setTimeout(() => {
                evaluateAnswer(roomId, userId, undefined);
            }, TIME_PER_QUESTION);
        }

        socket.on('survival:answer', ({ roomId, selectedOptionIndex }) => {
            evaluateAnswer(roomId, socket.userId, selectedOptionIndex);
        });

        async function evaluateAnswer(roomId, userId, ansIndex) {
            const duel = activeDuels[roomId];
            if (!duel) return;

            const p = duel.players[userId];
            if (!p || p.eliminated || p.isProcessing) return;

            p.isProcessing = true;
            if (p.timer) clearTimeout(p.timer);

            const q = p.questions && p.questions[p.qIndex];
            if (!q) return;
            const isCorrect = ansIndex === q.correctAnswer;



            io.to(p.socketId).emit('survival:roundResult', {
                correctAnswer: q.correctAnswer,
                selectedOption: ansIndex
            });

            if (isCorrect) {
                p.points += q.points;
                p.streak += 1;
                p.qIndex += 1;
                setTimeout(() => nextQuestion(roomId, userId), 1000);
            } else {
                const penalty = 5;
                p.points = Math.max(0, p.points - penalty);
                p.lives -= 1;
                p.streak = 0;

                if (p.lives <= 0) {
                    p.eliminated = true;
                    io.to(p.socketId).emit('survival:eliminated', {
                        reason: ansIndex === undefined ? 'Time out' : 'No lives remaining'
                    });
                    checkWinConditions(roomId);
                } else {
                    p.qIndex += 1;
                    setTimeout(() => nextQuestion(roomId, userId), 1000);
                }
            }

        }

        function checkWinConditions(roomId) {
            const duel = activeDuels[roomId];
            if (!duel) return;

            const playerIds = Object.keys(duel.players);
            const p1Id = playerIds[0];
            const p2Id = playerIds[1];
            const p1 = duel.players[p1Id];
            const p2 = duel.players[p2Id];


            io.to(roomId).emit('survival:stateUpdate', {
                players: serializePlayers(duel.players),
                globalTimerEnd: duel.globalTimerEnd
            });

            if (p1.eliminated && p2.eliminated) {

                let winner = null;
                if (p1.points > p2.points) winner = p1Id;
                else if (p2.points > p1.points) winner = p2Id;
                endDuel(roomId, winner);
                return;
            }

            if (p1.eliminated && !p2.eliminated) {
                if (p2.points > p1.points) {
                    endDuel(roomId, p2Id);
                }
            } else if (p2.eliminated && !p1.eliminated) {
                if (p1.points > p2.points) {
                    endDuel(roomId, p1Id);
                }
            }
        }

        async function endDuel(roomId, winnerId) {
            const duelData = activeDuels[roomId];
            if (!duelData) return;

            if (duelData.globalTimer) clearTimeout(duelData.globalTimer);
            Object.values(duelData.players).forEach(p => {
                if (p.timer) clearTimeout(p.timer);
            });

            io.to(roomId).emit('survival:stateUpdate', {
                players: serializePlayers(duelData.players),
                globalTimerEnd: duelData.globalTimerEnd
            });
            io.to(roomId).emit('survival:ended', {
                winnerId,
                players: serializePlayers(duelData.players)
            });

            try {
                await SurvivalDuel.findByIdAndUpdate(duelData.duelId, {
                    status: 'finished',
                    winner: winnerId,
                    finishedAt: new Date()
                });

                const playerIds = Object.keys(duelData.players);
                const isTie = !winnerId;

                const profiles = {};
                for (const uid of playerIds) {
                    let p = await DuelProfile.findOne({ user: uid });
                    if (!p) { p = new DuelProfile({ user: uid }); await p.save(); }
                    profiles[uid] = p;
                }

                const K = 32;
                if (playerIds.length === 2) {
                    const [aId, bId] = playerIds;
                    const eloA = profiles[aId].survivalElo || 1000;
                    const eloB = profiles[bId].survivalElo || 1000;
                    const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
                    const expectedB = 1 - expectedA;

                    let scoreA = 0.5, scoreB = 0.5;
                    if (!isTie && winnerId === aId) { scoreA = 1; scoreB = 0; }
                    else if (!isTie && winnerId === bId) { scoreA = 0; scoreB = 1; }

                    const newEloA = Math.max(100, Math.round(eloA + K * (scoreA - expectedA)));
                    const newEloB = Math.max(100, Math.round(eloB + K * (scoreB - expectedB)));

                    profiles[aId].survivalElo = newEloA;
                    profiles[aId].survivalTotalDuels = (profiles[aId].survivalTotalDuels || 0) + 1;
                    if (scoreA === 1) profiles[aId].survivalWins = (profiles[aId].survivalWins || 0) + 1;
                    else if (scoreA === 0) profiles[aId].survivalLosses = (profiles[aId].survivalLosses || 0) + 1;
                    profiles[aId].survivalBestStreak = Math.max(profiles[aId].survivalBestStreak || 0, duelData.players[aId].streak);
                    await profiles[aId].save();

                    profiles[bId].survivalElo = newEloB;
                    profiles[bId].survivalTotalDuels = (profiles[bId].survivalTotalDuels || 0) + 1;
                    if (scoreB === 1) profiles[bId].survivalWins = (profiles[bId].survivalWins || 0) + 1;
                    else if (scoreB === 0) profiles[bId].survivalLosses = (profiles[bId].survivalLosses || 0) + 1;
                    profiles[bId].survivalBestStreak = Math.max(profiles[bId].survivalBestStreak || 0, duelData.players[bId].streak);
                    await profiles[bId].save();

                    for (const uid of playerIds) {
                        const pData = duelData.players[uid];
                        if (pData && pData.questions && pData.qIndex > 0) {
                            const seenIds = pData.questions.slice(0, pData.qIndex + 1).map(q => q._id);
                            await DuelProfile.updateOne(
                                { user: uid },
                                { $addToSet: { survivalSeenQuestions: { $each: seenIds } } }
                            );
                        }
                    }

                    const sockA = io.sockets.sockets.get(duelData.players[aId]?.socketId);
                    const sockB = io.sockets.sockets.get(duelData.players[bId]?.socketId);
                    if (sockA) sockA.emit('survival:eloUpdate', { newElo: newEloA, delta: newEloA - eloA, rank: profiles[aId].survivalRank });
                    if (sockB) sockB.emit('survival:eloUpdate', { newElo: newEloB, delta: newEloB - eloB, rank: profiles[bId].survivalRank });
                }
            } catch (e) {
                console.error('Error saving duel', e);
            }

            delete activeDuels[roomId];
        }

        socket.on('disconnect', () => {
            const idx = queue.findIndex(p => p.userId === socket.userId);
            if (idx !== -1) queue.splice(idx, 1);
        });
    });
};

