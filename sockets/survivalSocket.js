const SurvivalDuel = require('../models/SurvivalDuel');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const DuelProfile = require('../models/DuelProfile');
const { v4: uuidv4 } = require('uuid');

let queue = [];
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
            bestStreak: p.bestStreak || 0,
            lives: p.lives,
            eliminated: p.eliminated,
            qIndex: p.qIndex,
            isConnected: !p.isDisconnected
        };
    }
    return result;
}

function handleGlobalTimeOut(roomId, io) {
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
    else if (p1.bestStreak > p2.bestStreak) winnerId = playerIds[0];
    else if (p2.bestStreak > p1.bestStreak) winnerId = playerIds[1];

    endDuel(roomId, winnerId, io);
}

function nextQuestion(roomId, userId, io) {
    const duel = activeDuels[roomId];
    if (!duel) return;

    const p = duel.players[userId];
    if (!p || p.eliminated) return;

    const q = p.questions && p.questions[p.qIndex];
    if (!q) {
        p.eliminated = true;
        checkWinConditions(roomId, io);
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
        evaluateAnswer(roomId, userId, undefined, io);
    }, TIME_PER_QUESTION);
}

async function evaluateAnswer(roomId, userId, ansIndex, io) {
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
        p.bestStreak = Math.max(p.bestStreak || 0, p.streak);

        const playerIds = Object.keys(duel.players);
        const oppId = playerIds.find(id => id !== userId);
        const opp = duel.players[oppId];
        if (opp && opp.eliminated && p.points > opp.points) {
            return endDuel(roomId, userId, io);
        }

        p.qIndex += 1;
        setTimeout(() => nextQuestion(roomId, userId, io), 1000);
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
            checkWinConditions(roomId, io);
        } else {
            p.qIndex += 1;
            setTimeout(() => nextQuestion(roomId, userId, io), 1000);
        }
    }
}

function checkWinConditions(roomId, io) {
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
        else if (p1.bestStreak > p2.bestStreak) winner = p1Id;
        else if (p2.bestStreak > p1.bestStreak) winner = p2Id;

        endDuel(roomId, winner, io);
        return;
    }

    if (p1.eliminated && !p2.eliminated) {
        if (p2.points > p1.points) endDuel(roomId, p2Id, io);
    } else if (p2.eliminated && !p1.eliminated) {
        if (p1.points > p2.points) endDuel(roomId, p1Id, io);
    }
}

async function endDuel(roomId, winnerId, io) {
    const duelData = activeDuels[roomId];
    if (!duelData) return;

    if (duelData.globalTimer) clearTimeout(duelData.globalTimer);
    Object.values(duelData.players).forEach(p => {
        if (p.timer) clearTimeout(p.timer);
        if (p.abandonmentTimer) clearTimeout(p.abandonmentTimer);
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
            let pProfile = await DuelProfile.findOne({ user: uid });
            if (!pProfile) { pProfile = new DuelProfile({ user: uid }); await pProfile.save(); }
            profiles[uid] = pProfile;
        }

        const K = 32;
        if (playerIds.length === 2) {
            const [aId, bId] = playerIds;
            const eloA = profiles[aId].survivalElo || 1000;
            const eloB = profiles[bId].survivalElo || 1000;
            const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
            const expectedB = 1 - expectedA;

            let scoreA = 0.5, scoreB = 0.5;
            if (!isTie && String(winnerId) === String(aId)) { scoreA = 1; scoreB = 0; }
            else if (!isTie && String(winnerId) === String(bId)) { scoreA = 0; scoreB = 1; }

            const newEloA = Math.max(100, Math.round(eloA + K * (scoreA - expectedA)));
            const newEloB = Math.max(100, Math.round(eloB + K * (scoreB - expectedB)));

            console.log(`[Survival] Duel Ended. Winner: ${winnerId}, isTie: ${isTie}`);
            console.log(`[Survival] P1(${aId}): ${eloA} -> ${newEloA} (Score: ${scoreA})`);
            console.log(`[Survival] P2(${bId}): ${eloB} -> ${newEloB} (Score: ${scoreB})`);

            profiles[aId].survivalElo = newEloA;
            profiles[aId].survivalTotalDuels = (profiles[aId].survivalTotalDuels || 0) + 1;
            if (scoreA === 1) profiles[aId].survivalWins = (profiles[aId].survivalWins || 0) + 1;
            else if (scoreA === 0) profiles[aId].survivalLosses = (profiles[aId].survivalLosses || 0) + 1;
            profiles[aId].survivalBestStreak = Math.max(profiles[aId].survivalBestStreak || 0, duelData.players[aId].bestStreak);

            profiles[bId].survivalElo = newEloB;
            profiles[bId].survivalTotalDuels = (profiles[bId].survivalTotalDuels || 0) + 1;
            if (scoreB === 1) profiles[bId].survivalWins = (profiles[bId].survivalWins || 0) + 1;
            else if (scoreB === 0) profiles[bId].survivalLosses = (profiles[bId].survivalLosses || 0) + 1;
            profiles[bId].survivalBestStreak = Math.max(profiles[bId].survivalBestStreak || 0, duelData.players[bId].bestStreak);

            for (const uid of playerIds) {
                const pData = duelData.players[uid];
                if (pData && pData.questions && pData.qIndex > 0) {
                    const seenIds = pData.questions.slice(0, pData.qIndex + 1).map(q => q._id);
                    const currentSeen = profiles[uid].survivalSeenQuestions || [];

                    const updatedSeen = [...new Set([...currentSeen, ...seenIds])].slice(-500);
                    profiles[uid].survivalSeenQuestions = updatedSeen;
                }
            }

            await profiles[aId].save();
            console.log(`[Survival] Saved Profile for P1: ${aId}`);
            await profiles[bId].save();
            console.log(`[Survival] Saved Profile for P2: ${bId}`);

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

async function startSurvivalDuel(p1, p2, io) {
    try {
        const roomId = uuidv4();
        const duelModel = new SurvivalDuel({
            roomId,
            players: [
                { user: p1.userId, points: 0, streak: 0, eliminated: false },
                { user: p2.userId, points: 0, streak: 0, eliminated: false }
            ],
            status: 'active',
            startedAt: new Date()
        });
        await duelModel.save();

        const [prof1, prof2] = await Promise.all([
            DuelProfile.findOne({ user: p1.userId }),
            DuelProfile.findOne({ user: p2.userId })
        ]);

        const rank1 = prof1?.survivalRank || 'Recruit';
        const rank2 = prof2?.survivalRank || 'Recruit';
        let exclude1 = prof1?.survivalSeenQuestions || [];
        let exclude2 = prof2?.survivalSeenQuestions || [];

        const [questions1, questions2] = await Promise.all([
            getQuestionsForRank(rank1, 60, exclude1),
            getQuestionsForRank(rank2, 60, exclude2)
        ]);

        const p1Socket = io.sockets.sockets.get(p1.socketId);
        const p2Socket = io.sockets.sockets.get(p2.socketId);
        if (p1Socket) { p1Socket.join(roomId); p1Socket.roomId = roomId; }
        if (p2Socket) { p2Socket.join(roomId); p2Socket.roomId = roomId; }

        const globalTimerEnd = Date.now() + DUEL_MAX_TIME + 3000;
        activeDuels[roomId] = {
            roomId,
            duelId: duelModel._id,
            globalTimerEnd,
            players: {
                [p1.userId]: { username: p1.username, points: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false, socketId: p1.socketId, qIndex: 0, questions: questions1, rank: rank1, isDisconnected: false },
                [p2.userId]: { username: p2.username, points: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false, socketId: p2.socketId, qIndex: 0, questions: questions2, rank: rank2, isDisconnected: false }
            },
        };

        io.to(roomId).emit('survival:matched', {
            roomId,
            duelId: duelModel._id.toString(),
            players: [p1.username, p2.username],
            globalTimerEnd,
            ranks: { [p1.userId]: rank1, [p2.userId]: rank2 }
        });

        activeDuels[roomId].globalTimer = setTimeout(() => handleGlobalTimeOut(roomId, io), DUEL_MAX_TIME + 3000);
        setTimeout(() => {
            nextQuestion(roomId, p1.userId, io);
            nextQuestion(roomId, p2.userId, io);
        }, 3000);
    } catch (err) { console.error("Match error:", err); }
}

module.exports = function attachSurvivalSocket(io) {
    setInterval(() => {
        if (queue.length < 2) return;

        let i = 0;
        while (i < queue.length) {
            const p1 = queue[i];
            const timeInQueue = Date.now() - p1.joinedAt;
            const allowedGap = timeInQueue > 15000 ? 600 : 300;

            let matchedIdx = -1;
            for (let j = i + 1; j < queue.length; j++) {
                const p2 = queue[j];
                const eloDiff = Math.abs(p1.elo - p2.elo);
                if (eloDiff <= allowedGap) {
                    matchedIdx = j;
                    break;
                }
            }

            if (matchedIdx !== -1) {
                const p2 = queue.splice(matchedIdx, 1)[0];
                queue.splice(i, 1);
                startSurvivalDuel(p1, p2, io);
            } else {
                i++;
            }
        }
    }, 2000);

    io.on('connection', (socket) => {
        if (!socket.userId) return;

        socket.on('survival:joinQueue', async () => {
            const alreadyInQueue = queue.find(p => p.userId === socket.userId);
            if (alreadyInQueue) return;

            try {
                const profile = await DuelProfile.findOne({ user: socket.userId });
                const elo = profile?.survivalElo || 1000;

                queue.push({
                    userId: socket.userId,
                    socketId: socket.id,
                    username: socket.username,
                    elo,
                    joinedAt: Date.now()
                });

                socket.emit('survival:queued', { position: queue.length });
            } catch (err) {
                console.error("Join Queue error:", err);
                socket.emit('survival:error', { message: "Failed to join queue" });
            }
        });

        socket.on('survival:leaveQueue', () => {
            queue = queue.filter(p => p.userId !== socket.userId);
        });

        socket.on('survival:reconnect', ({ roomId }) => {
            const duel = activeDuels[roomId];
            if (!duel) return;
            const p = duel.players[socket.userId];
            if (!p) return;

            p.isDisconnected = false;
            p.socketId = socket.id;
            socket.roomId = roomId;
            if (p.abandonmentTimer) {
                clearTimeout(p.abandonmentTimer);
                p.abandonmentTimer = null;
            }

            socket.join(roomId);
            io.to(roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

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

        socket.on('survival:answer', ({ roomId, selectedOptionIndex }) => {
            evaluateAnswer(roomId, socket.userId, selectedOptionIndex, io);
        });

        socket.on('disconnect', () => {
            queue = queue.filter(p => p.userId !== socket.userId);

            if (socket.roomId) {
                const duel = activeDuels[socket.roomId];
                if (duel) {
                    const p = duel.players[socket.userId];
                    if (p && !p.eliminated) {
                        p.isDisconnected = true;
                        io.to(socket.roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

                        p.abandonmentTimer = setTimeout(() => {
                            if (p.isDisconnected) {
                                p.eliminated = true;
                                checkWinConditions(socket.roomId, io);
                            }
                        }, 30000);
                    }
                }
            }
        });
    });
};
