// const mongoose = require('mongoose');
// const SurvivalDuel = require('../models/SurvivalDuel');
// const SurvivalQuestion = require('../models/SurvivalQuestion');
// const DuelProfile = require('../models/DuelProfile');
// const { v4: uuidv4 } = require('uuid');

// let queue = [];
// const activeDuels = {};
// const TIME_PER_QUESTION = 20000;
// const DUEL_MAX_TIME = 180000;

// const RANK_DIFFICULTY = {
//     Recruit: ['Easy'],
//     Survivor: ['Easy', 'Medium'],
//     Fighter: ['Medium'],
//     Warrior: ['Medium', 'Hard'],
//     Champion: ['Hard'],
//     Legend: ['Hard'],
// };

// async function getQuestionsForRank(rank, count = 50, excludeIds = []) {
//     const difficulties = RANK_DIFFICULTY[rank] || ['Easy'];
//     const ninIds = excludeIds.map(id => {
//         try { return new mongoose.Types.ObjectId(id); } catch (e) { return id; }
//     });

//     return await SurvivalQuestion.aggregate([
//         {
//             $match: {
//                 active: true,
//                 difficulty: { $in: difficulties },
//                 _id: { $nin: ninIds }
//             }
//         },
//         { $sample: { size: count } }
//     ]);
// }

// const BOT_NAMES = [
//     'Erik_The_Red', 'Bjorn_Ironside', 'Ivar_Boneless', 'Sigurd_SnakeEye',
//     'Lagertha_Code', 'Astrid_Shield', 'Floki_Builder', 'Harald_Finehair',
//     'Rollo_Duke', 'Ubbe_Ragnarsson', 'Gunnhild_Warrior', 'Torvi_Hunter'
// ];

// const BOT_CONFIG = {
//     Recruit: { accuracy: { Easy: 0.85, Medium: 0.50, Hard: 0.20 }, minDelay: 8000, maxDelay: 14000 },
//     Survivor: { accuracy: { Easy: 0.90, Medium: 0.65, Hard: 0.35 }, minDelay: 7000, maxDelay: 12000 },
//     Fighter: { accuracy: { Easy: 0.95, Medium: 0.75, Hard: 0.50 }, minDelay: 6000, maxDelay: 10000 },
//     Warrior: { accuracy: { Easy: 0.98, Medium: 0.82, Hard: 0.60 }, minDelay: 5000, maxDelay: 9000 },
//     Champion: { accuracy: { Easy: 1.00, Medium: 0.88, Hard: 0.72 }, minDelay: 4000, maxDelay: 7000 },
//     Legend: { accuracy: { Easy: 1.00, Medium: 0.95, Hard: 0.85 }, minDelay: 3000, maxDelay: 6000 },
// };

// function serializePlayers(players) {
//     const result = {};
//     for (const [uid, p] of Object.entries(players)) {
//         result[uid] = {
//             username: p.username,
//             points: p.points,
//             streak: p.streak,
//             bestStreak: p.bestStreak || 0,
//             lives: p.lives,
//             eliminated: p.eliminated,
//             qIndex: p.qIndex,
//             qCount: p.questions?.length || 0,
//             isConnected: p.isBot ? true : !p.isDisconnected,
//             isBot: !!p.isBot
//         };
//     }
//     return result;
// }

// function handleGlobalTimeOut(roomId, io) {
//     const duel = activeDuels[roomId];
//     if (!duel) return;

//     const playerIds = Object.keys(duel.players);
//     playerIds.forEach(uid => {
//         const p = duel.players[uid];
//         if (p.timer) clearTimeout(p.timer);
//         if (p.botActionTimer) clearTimeout(p.botActionTimer);
//     });

//     const p1 = duel.players[playerIds[0]];
//     const p2 = duel.players[playerIds[1]];

//     let winnerId = null;
//     if (p1.points > p2.points) winnerId = playerIds[0];
//     else if (p2.points > p1.points) winnerId = playerIds[1];
//     else if (p1.bestStreak > p2.bestStreak) winnerId = playerIds[0];
//     else if (p2.bestStreak > p1.bestStreak) winnerId = playerIds[1];

//     endDuel(roomId, winnerId, io);
// }

// function nextQuestion(roomId, userId, io) {
//     const duel = activeDuels[roomId];
//     if (!duel) return;

//     const p = duel.players[String(userId)];
//     if (!p) return;
//     if (p.eliminated) return;

//     const q = p.questions && p.questions[p.qIndex];
//     if (!q) {
//         p.eliminated = true;
//         checkWinConditions(roomId, io);
//         return;
//     }

//     p.isProcessing = false;

//     io.to(roomId).emit('survival:stateUpdate', {
//         players: serializePlayers(duel.players),
//         globalTimerEnd: duel.globalTimerEnd
//     });

//     if (!p.isBot && p.socketId) {
//         io.to(p.socketId).emit('survival:question', {
//             index: p.qIndex,
//             questionText: q.questionText,
//             codeSnippet: q.codeSnippet,
//             options: q.options,
//             type: q.type,
//             difficulty: q.difficulty,
//             points: q.points,
//             timeLimit: TIME_PER_QUESTION
//         });
//     }

//     if (p.timer) clearTimeout(p.timer);
//     p.timer = setTimeout(() => {
//         evaluateAnswer(roomId, userId, undefined, io);
//     }, TIME_PER_QUESTION);

//     if (p.isBot) {
//         runBotTurn(roomId, userId, io);
//     }
// }

// async function runBotTurn(roomId, botId, io) {
//     const duel = activeDuels[roomId];
//     if (!duel) return;
//     const p = duel.players[botId];
//     if (!p || p.eliminated) return;

//     const q = p.questions[p.qIndex];
//     if (!q) return;

//     const config = BOT_CONFIG[p.rank] || BOT_CONFIG.Recruit;
//     const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;

//     if (p.botActionTimer) clearTimeout(p.botActionTimer);
//     p.botActionTimer = setTimeout(() => {
//         if (!activeDuels[roomId] || p.eliminated) return;

//         const accuracy = config.accuracy[q.difficulty] || 0.5;
//         const isCorrect = Math.random() < accuracy;
//         const answerIndex = isCorrect ? q.correctAnswer : (q.correctAnswer + 1) % q.options.length;

//         evaluateAnswer(roomId, botId, answerIndex, io);
//     }, delay);
// }

// async function evaluateAnswer(roomId, userId, ansIndex, io) {
//     const duel = activeDuels[roomId];
//     if (!duel) return;

//     const p = duel.players[userId];
//     if (!p || p.eliminated || p.isProcessing) return;

//     p.isProcessing = true;
//     if (p.timer) clearTimeout(p.timer);
//     if (p.botActionTimer) clearTimeout(p.botActionTimer);

//     const q = p.questions && p.questions[p.qIndex];
//     if (!q) return;

//     const isCorrect = ansIndex === q.correctAnswer;

//     if (!p.isBot && p.socketId) {
//         io.to(p.socketId).emit('survival:roundResult', {
//             correctAnswer: q.correctAnswer,
//             selectedOption: ansIndex
//         });
//     }

//     if (isCorrect) {
//         p.points += q.points;
//         p.streak += 1;
//         p.bestStreak = Math.max(p.bestStreak || 0, p.streak);

//         const playerIds = Object.keys(duel.players);
//         const oppId = playerIds.find(id => id !== userId);
//         const opp = duel.players[oppId];
//         if (opp && opp.eliminated && p.points > opp.points) {
//             return endDuel(roomId, userId, io);
//         }

//         p.qIndex += 1;
//         setTimeout(() => nextQuestion(roomId, userId, io), 1000);
//     } else {
//         const penalty = 5;
//         p.points = Math.max(0, p.points - penalty);
//         p.lives -= 1;
//         p.streak = 0;

//         if (p.lives <= 0) {
//             p.eliminated = true;
//             if (!p.isBot && p.socketId) {
//                 io.to(p.socketId).emit('survival:eliminated', {
//                     reason: ansIndex === undefined ? 'Time out' : 'No lives remaining'
//                 });
//             }
//             checkWinConditions(roomId, io);
//         } else {
//             p.qIndex += 1;
//             setTimeout(() => nextQuestion(roomId, userId, io), 1000);
//         }
//     }
// }

// function checkWinConditions(roomId, io) {
//     const duel = activeDuels[roomId];
//     if (!duel) return;

//     const playerIds = Object.keys(duel.players);
//     const p1Id = playerIds[0];
//     const p2Id = playerIds[1];
//     const p1 = duel.players[p1Id];
//     const p2 = duel.players[p2Id];

//     io.to(roomId).emit('survival:stateUpdate', {
//         players: serializePlayers(duel.players),
//         globalTimerEnd: duel.globalTimerEnd
//     });

//     if (p1.eliminated && p2.eliminated) {
//         let winner = null;
//         if (p1.points > p2.points) winner = p1Id;
//         else if (p2.points > p1.points) winner = p2Id;
//         else if (p1.bestStreak > p2.bestStreak) winner = p1Id;
//         else if (p2.bestStreak > p1.bestStreak) winner = p2Id;

//         endDuel(roomId, winner, io);
//         return;
//     }

//     if (p1.eliminated && !p2.eliminated) {
//         if (p2.points > p1.points) endDuel(roomId, p2Id, io);
//     } else if (p2.eliminated && !p1.eliminated) {
//         if (p1.points > p2.points) endDuel(roomId, p1Id, io);
//     }
// }

// async function endDuel(roomId, winnerId, io) {
//     const duelData = activeDuels[roomId];
//     if (!duelData) return;

//     if (duelData.globalTimer) clearTimeout(duelData.globalTimer);
//     Object.values(duelData.players).forEach(p => {
//         if (p.timer) clearTimeout(p.timer);
//         if (p.abandonmentTimer) clearTimeout(p.abandonmentTimer);
//         if (p.botActionTimer) clearTimeout(p.botActionTimer);
//     });

//     io.to(roomId).emit('survival:stateUpdate', {
//         players: serializePlayers(duelData.players),
//         globalTimerEnd: duelData.globalTimerEnd
//     });

//     io.to(roomId).emit('survival:ended', {
//         winnerId,
//         players: serializePlayers(duelData.players)
//     });

//     try {
//         const finalPlayers = Object.keys(duelData.players).map(uid => ({
//             user: duelData.players[uid].isBot ? null : uid,
//             points: duelData.players[uid].points,
//             streak: duelData.players[uid].bestStreak || 0,
//             eliminated: duelData.players[uid].eliminated
//         }));

//         await SurvivalDuel.findByIdAndUpdate(duelData.duelId, {
//             status: 'finished',
//             winner: winnerId,
//             players: finalPlayers,
//             finishedAt: new Date()
//         });

//         const playerIds = Object.keys(duelData.players);
//         const isTie = !winnerId;
//         const profiles = {};

//         for (const uid of playerIds) {
//             if (duelData.players[uid].isBot) continue;
//             let pProfile = await DuelProfile.findOne({ user: uid });
//             if (!pProfile) { pProfile = new DuelProfile({ user: uid }); await pProfile.save(); }
//             profiles[uid] = pProfile;
//         }

//         const K = 32;
//         if (playerIds.length === 2) {
//             const [aId, bId] = playerIds;

//             for (const uid of [aId, bId]) {
//                 const p = duelData.players[uid];
//                 if (p.isBot) continue;

//                 const oppId = uid === aId ? bId : aId;
//                 const opp = duelData.players[oppId];

//                 const prof = profiles[uid];
//                 const elo = prof.survivalElo || 1000;
//                 const oppElo = opp.isBot ? elo : (profiles[oppId]?.survivalElo || 1000);

//                 const expected = 1 / (1 + Math.pow(10, (oppElo - elo) / 400));
//                 let score = 0.5;
//                 if (!isTie && String(winnerId) === String(uid)) score = 1;
//                 else if (!isTie && String(winnerId) === String(oppId)) score = 0;

//                 const newElo = Math.max(100, Math.round(elo + K * (score - expected)));
//                 const delta = newElo - elo;

//                 prof.survivalElo = newElo;
//                 prof.survivalTotalDuels = (prof.survivalTotalDuels || 0) + 1;
//                 if (score === 1) prof.survivalWins = (prof.survivalWins || 0) + 1;
//                 else if (score === 0) prof.survivalLosses = (prof.survivalLosses || 0) + 1;
//                 prof.survivalBestStreak = Math.max(prof.survivalBestStreak || 0, p.bestStreak);

//                 if (p.questions && p.qIndex > 0) {
//                     const seenIds = p.questions.slice(0, p.qIndex + 1).map(q => q._id.toString());
//                     const currentSeen = (prof.survivalSeenQuestions || []).map(id => id.toString());
//                     const uniqueSeen = [...new Set([...currentSeen, ...seenIds])];
//                     prof.survivalSeenQuestions = uniqueSeen.slice(-800);
//                 }

//                 await prof.save();

//                 const sock = io.sockets.sockets.get(p.socketId);
//                 if (sock) sock.emit('survival:eloUpdate', { newElo, delta, rank: prof.survivalRank });
//             }
//         }
//     } catch (e) {
//         console.error('Error saving duel', e);
//     }
//     delete activeDuels[roomId];
// }

// async function startSurvivalDuel(p1, p2, io) {
//     try {
//         const roomId = uuidv4();
//         const duelModel = new SurvivalDuel({
//             roomId,
//             players: [
//                 { user: p1.userId, points: 0, streak: 0, eliminated: false },
//                 { user: p2.userId, points: 0, streak: 0, eliminated: false }
//             ],
//             status: 'active',
//             startedAt: new Date()
//         });
//         await duelModel.save();

//         const [prof1, prof2] = await Promise.all([
//             DuelProfile.findOne({ user: p1.userId }),
//             p2.isBot ? null : DuelProfile.findOne({ user: p2.userId })
//         ]);

//         const rank1 = prof1?.survivalRank || 'Recruit';
//         const rank2 = p2.isBot ? rank1 : (prof2?.survivalRank || 'Recruit');

//         const [questions1, questions2] = await Promise.all([
//             getQuestionsForRank(rank1, 60, prof1?.survivalSeenQuestions || []),
//             getQuestionsForRank(rank2, 60, p2.isBot ? [] : (prof2?.survivalSeenQuestions || []))
//         ]);

//         const p1Socket = io.sockets.sockets.get(p1.socketId);
//         if (p1Socket) { p1Socket.join(roomId); p1Socket.roomId = roomId; }

//         let p2Socket = null;
//         if (!p2.isBot) {
//             p2Socket = io.sockets.sockets.get(p2.socketId);
//             if (p2Socket) { p2Socket.join(roomId); p2Socket.roomId = roomId; }
//         }

//         const globalTimerEnd = Date.now() + DUEL_MAX_TIME + 3000;
//         const p1Id = String(p1.userId);
//         const p2Id = String(p2.userId);

//         activeDuels[roomId] = {
//             roomId,
//             duelId: duelModel._id,
//             globalTimerEnd,
//             players: {
//                 [p1Id]: { username: p1.username, points: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false, socketId: p1.socketId, qIndex: 0, questions: questions1, rank: rank1, isDisconnected: false, isBot: false },
//                 [p2Id]: {
//                     username: p2.username, points: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false,
//                     socketId: p2.socketId, qIndex: 0, questions: questions2, rank: rank2,
//                     isDisconnected: false, isBot: !!p2.isBot
//                 }
//             },
//         };

//         console.log(`[Survival] Duel Created: ${roomId}. Players: [${p1Id}, ${p2Id}]`);

//         io.to(roomId).emit('survival:matched', {
//             roomId,
//             duelId: duelModel._id.toString(),
//             players: serializePlayers(activeDuels[roomId].players),
//             globalTimerEnd,
//             ranks: { [p1Id]: rank1, [p2Id]: rank2 }
//         });

//         activeDuels[roomId].globalTimer = setTimeout(() => handleGlobalTimeOut(roomId, io), DUEL_MAX_TIME + 3000);
//         setTimeout(() => {
//             console.log(`[Survival] Duel Start: Triggering nextQuestion for ${p1Id} and ${p2Id}`);
//             nextQuestion(roomId, p1Id, io);
//             nextQuestion(roomId, p2Id, io);
//         }, 5000);
//     } catch (err) { console.error("Match error:", err); }
// }

// module.exports = function attachSurvivalSocket(io) {
//     setInterval(() => {
//         if (queue.length === 0) return;

//         let i = 0;
//         while (i < queue.length) {
//             const p1 = queue[i];
//             const timeInQueue = Date.now() - p1.joinedAt;

//             if (timeInQueue > 12000) {
//                 queue.splice(i, 1);
//                 const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
//                 startSurvivalDuel(p1, {
//                     userId: new mongoose.Types.ObjectId(),
//                     username: botName,
//                     isBot: true
//                 }, io);
//                 continue;
//             }

//             const allowedGap = timeInQueue > 10000 ? 600 : (timeInQueue > 5000 ? 300 : 100);

//             let matchedIdx = -1;
//             for (let j = i + 1; j < queue.length; j++) {
//                 const p2 = queue[j];
//                 if (Math.abs(p1.elo - p2.elo) <= allowedGap) {
//                     matchedIdx = j;
//                     break;
//                 }
//             }

//             if (matchedIdx !== -1) {
//                 const p2 = queue.splice(matchedIdx, 1)[0];
//                 queue.splice(i, 1);
//                 startSurvivalDuel(p1, p2, io);
//             } else {
//                 i++;
//             }
//         }
//     }, 2000);

//     io.on('connection', (socket) => {
//         if (!socket.userId) {
//             console.log(`[Survival] Unauthenticated socket connection attempt: ${socket.id}`);
//             return;
//         }

//         socket.on('survival:joinQueue', async () => {
//             if (queue.find(p => p.userId === socket.userId)) return;
//             try {
//                 const profile = await DuelProfile.findOne({ user: socket.userId });
//                 queue.push({ userId: socket.userId, socketId: socket.id, username: socket.username, elo: profile?.survivalElo || 1000, joinedAt: Date.now() });
//                 socket.emit('survival:queued', { position: queue.length });
//             } catch (err) { socket.emit('survival:error', { message: "Failed to join queue" }); }
//         });

//         socket.on('survival:leaveQueue', () => {
//             queue = queue.filter(p => p.userId !== socket.userId);
//         });

//         socket.on('survival:reconnect', ({ roomId }) => {
//             const duel = activeDuels[roomId];
//             if (!duel) return;
//             const uid = String(socket.userId);
//             const p = duel.players[uid];
//             if (!p) return;
//             if (p.isBot) return;

//             p.isDisconnected = false;
//             p.socketId = socket.id;
//             socket.roomId = roomId;
//             if (p.abandonmentTimer) { clearTimeout(p.abandonmentTimer); p.abandonmentTimer = null; }

//             socket.join(roomId);
//             io.to(roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

//             if (!p.eliminated) {
//                 const q = p.questions && p.questions[p.qIndex];
//                 if (q) {
//                     io.to(socket.id).emit('survival:question', {
//                         index: p.qIndex, questionText: q.questionText, codeSnippet: q.codeSnippet,
//                         options: q.options, type: q.type, difficulty: q.difficulty, points: q.points, timeLimit: TIME_PER_QUESTION
//                     });
//                 }
//             }
//         });

//         socket.on('survival:answer', ({ roomId, selectedOptionIndex }) => {
//             evaluateAnswer(roomId, socket.userId, selectedOptionIndex, io);
//         });

//         socket.on('disconnect', () => {
//             queue = queue.filter(p => p.userId !== socket.userId);
//             if (socket.roomId) {
//                 const duel = activeDuels[socket.roomId];
//                 if (duel) {
//                     const p = duel.players[socket.userId];
//                     if (p && !p.eliminated && !p.isBot) {
//                         p.isDisconnected = true;
//                         io.to(socket.roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });
//                         p.abandonmentTimer = setTimeout(() => {
//                             if (p.isDisconnected) { p.eliminated = true; checkWinConditions(socket.roomId, io); }
//                         }, 30000);
//                     }
//                 }
//             }
//         });
//     });
// };



const mongoose = require('mongoose');
const SurvivalDuel = require('../models/SurvivalDuel');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const DuelProfile = require('../models/DuelProfile');
const { v4: uuidv4 } = require('uuid');
const { redis, getJson, setJson, del } = require('../services/redis');
const { addQuestionTimer, addGlobalTimer, addEndMatchJob } = require('../services/survivalQueue');
const { recordSolve } = require('../services/userActivityService');


const REDIS_QUEUE_KEY = 'survival:queue';
const REDIS_DUEL_PREFIX = 'survival:duel:';

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

    const totalCount = await SurvivalQuestion.countDocuments({
        active: true,
        difficulty: { $in: difficulties }
    });

    let finalExcludeIds = excludeIds;

    if (excludeIds.length >= (totalCount * 0.8)) {
        console.log(`[Survival] Pool exhausted > 80% for rank ${rank}. Rotating history.`);

        const keepCount = Math.floor(totalCount * 0.2);
        finalExcludeIds = excludeIds.slice(-keepCount);
    }

    const ninIds = finalExcludeIds.map(id => {
        try { return new mongoose.Types.ObjectId(id); } catch (e) { return id; }
    });

    return await SurvivalQuestion.aggregate([
        {
            $match: {
                active: true,
                difficulty: { $in: difficulties },
                _id: { $nin: ninIds }
            }
        },
        { $sample: { size: count } }
    ]);
}

const BOT_NAMES = [
    'Erik_The_Red', 'Bjorn_Ironside', 'Ivar_Boneless', 'Sigurd_SnakeEye',
    'Lagertha_Code', 'Astrid_Shield', 'Floki_Builder', 'Harald_Finehair',
    'Rollo_Duke', 'Ubbe_Ragnarsson', 'Gunnhild_Warrior', 'Torvi_Hunter'
];

const BOT_CONFIG = {
    Recruit: { accuracy: { Easy: 0.85, Medium: 0.50, Hard: 0.20 }, minDelay: 8000, maxDelay: 14000 },
    Survivor: { accuracy: { Easy: 0.90, Medium: 0.65, Hard: 0.35 }, minDelay: 7000, maxDelay: 12000 },
    Fighter: { accuracy: { Easy: 0.95, Medium: 0.75, Hard: 0.50 }, minDelay: 6000, maxDelay: 10000 },
    Warrior: { accuracy: { Easy: 0.98, Medium: 0.82, Hard: 0.60 }, minDelay: 5000, maxDelay: 9000 },
    Champion: { accuracy: { Easy: 1.00, Medium: 0.88, Hard: 0.72 }, minDelay: 4000, maxDelay: 7000 },
    Legend: { accuracy: { Easy: 1.00, Medium: 0.95, Hard: 0.85 }, minDelay: 3000, maxDelay: 6000 },
};

function serializePlayers(players) {
    const result = {};
    for (const [uid, p] of Object.entries(players)) {
        result[uid] = {
            username: p.nickname || p.username,
            points: p.points,
            streak: p.streak,
            bestStreak: p.bestStreak || 0,
            lives: p.lives,
            eliminated: p.eliminated,
            qIndex: p.qIndex,
            qCount: p.questions?.length || 0,
            isConnected: p.isBot ? true : !p.isDisconnected,
            isBot: !!p.isBot
        };
    }
    return result;
}



async function handleGlobalTimeOut(roomId, io) {
    if (!await acquireLock(roomId)) return;

    try {
        const duel = await getJson(REDIS_DUEL_PREFIX + roomId);
        if (!duel) return;

        let winnerId = null;
        const pIds = Object.keys(duel.players);
        const p1Id = pIds[0];
        const p2Id = pIds[1];
        const p1 = duel.players[p1Id];
        const p2 = duel.players[p2Id];

        if (p1.points > p2.points) winnerId = p1Id;
        else if (p2.points > p1.points) winnerId = p2Id;
        else if (!p1.eliminated && p2.eliminated) winnerId = p1Id;
        else if (!p2.eliminated && p1.eliminated) winnerId = p2Id;
        else if (p1.qIndex > p2.qIndex) winnerId = p1Id;
        else if (p2.qIndex > p1.qIndex) winnerId = p2Id;
        else if (p1.bestStreak > p2.bestStreak) winnerId = p1Id;
        else if (p2.bestStreak > p1.bestStreak) winnerId = p2Id;

        await endDuel(roomId, winnerId, io, duel);
    } catch (err) {
        console.error("Global Timeout error:", err);
    } finally {
        await releaseLock(roomId);
    }
}

async function nextQuestion(roomId, userId, io) {
    const duel = await getJson(REDIS_DUEL_PREFIX + roomId);
    if (!duel) return;

    const p = duel.players[String(userId)];
    if (!p || p.eliminated) return;

    const q = p.questions && p.questions[p.qIndex];
    if (!q) {
        p.eliminated = true;
        duel.players[String(userId)] = p;
        await setJson(REDIS_DUEL_PREFIX + roomId, duel);
        await checkWinConditions(roomId, io);
        return;
    }

    p.isProcessing = false;
    duel.players[String(userId)] = p;
    await setJson(REDIS_DUEL_PREFIX + roomId, duel);

    io.to(roomId).emit('survival:stateUpdate', {
        players: serializePlayers(duel.players),
        globalTimerEnd: duel.globalTimerEnd
    });

    if (!p.isBot && p.socketId) {
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
    }

    await addQuestionTimer(roomId, userId, p.qIndex, TIME_PER_QUESTION);


    if (p.isBot) {
        await runBotTurn(roomId, userId, io);
    }
}

async function runBotTurn(roomId, botId, io) {
    const duel = await getJson(REDIS_DUEL_PREFIX + roomId);
    if (!duel) return;
    const p = duel.players[botId];
    if (!p || p.eliminated) return;

    const q = p.questions[p.qIndex];
    if (!q) return;

    const config = BOT_CONFIG[p.rank] || BOT_CONFIG.Recruit;
    const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;

    setTimeout(async () => {
        const currentDuel = await getJson(REDIS_DUEL_PREFIX + roomId);
        if (!currentDuel || currentDuel.players[botId]?.eliminated) return;

        const accuracy = config.accuracy[q.difficulty] || 0.5;
        const isCorrect = Math.random() < accuracy;
        const answerIndex = isCorrect ? q.correctAnswer : (q.correctAnswer + 1) % q.options.length;

        await evaluateAnswer(roomId, botId, answerIndex, io);
    }, delay);
}

async function acquireLock(roomId, timeout = 5000) {
    const lockKey = `lock:survival:${roomId}`;
    const result = await redis.set(lockKey, '1', 'PX', timeout, 'NX');
    return result === 'OK';
}

async function releaseLock(roomId) {
    await del(`lock:survival:${roomId}`);
}

async function evaluateAnswer(roomId, userId, selectedOptionIndex, io) {
    // Acquire lock to prevent race conditions
    let lockAcquired = false;
    for (let i = 0; i < 5; i++) {
        if (await acquireLock(roomId)) {
            lockAcquired = true;
            break;
        }
        await new Promise(r => setTimeout(r, 100)); // retry
    }

    if (!lockAcquired) return; // Silent fail if lock cannot be acquired

    try {
        let duel = await getJson(REDIS_DUEL_PREFIX + roomId);
        if (!duel) return;

        const p = duel.players[userId];
        if (!p || p.eliminated || (p.isProcessing && selectedOptionIndex !== undefined)) return;

        p.isProcessing = true;

        const q = p.questions && p.questions[p.qIndex];
        if (!q) {
            await setJson(REDIS_DUEL_PREFIX + roomId, duel);
            return;
        }

        const isCorrect = selectedOptionIndex === q.correctAnswer;

        if (!p.isBot && p.socketId) {
            io.to(p.socketId).emit('survival:roundResult', {
                correctAnswer: q.correctAnswer,
                selectedOption: selectedOptionIndex
            });
        }

        if (isCorrect) {
            p.points += q.points;
            p.streak += 1;
            p.bestStreak = Math.max(p.bestStreak || 0, p.streak);

            if (!p.isBot) {
                await recordSolve(userId);
            }

            const playerIds = Object.keys(duel.players);
            const oppId = playerIds.find(id => id !== userId);
            const opp = duel.players[oppId];

            if (opp && opp.eliminated && p.points > opp.points) {
                await setJson(REDIS_DUEL_PREFIX + roomId, duel);
                return await endDuel(roomId, userId, io, duel);
            }

            p.qIndex += 1;
            await setJson(REDIS_DUEL_PREFIX + roomId, duel);
            setTimeout(() => nextQuestion(roomId, userId, io), 1000);
        } else {
            const penalty = 5;
            p.points = Math.max(0, p.points - penalty);
            p.lives -= 1;
            p.streak = 0;

            if (p.lives <= 0) {
                p.eliminated = true;
                if (!p.isBot && p.socketId) {
                    io.to(p.socketId).emit('survival:eliminated', {
                        reason: selectedOptionIndex === undefined ? 'Time out' : 'No lives remaining'
                    });
                }
                await setJson(REDIS_DUEL_PREFIX + roomId, duel);
                await checkWinConditions(roomId, io, duel);
            } else {
                p.qIndex += 1;
                await setJson(REDIS_DUEL_PREFIX + roomId, duel);
                setTimeout(() => nextQuestion(roomId, userId, io), 1000);
            }
        }
    } catch (err) {
        console.error("Evaluate error:", err);
    } finally {
        await releaseLock(roomId);
    }
}

async function checkWinConditions(roomId, io, existingDuel = null) {
    const duel = existingDuel || (await getJson(REDIS_DUEL_PREFIX + roomId));
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
        else if (p1.qIndex > p2.qIndex) winner = p1Id;
        else if (p2.qIndex > p1.qIndex) winner = p2Id;
        else if (p1.bestStreak > p2.bestStreak) winner = p1Id;
        else if (p2.bestStreak > p1.bestStreak) winner = p2Id;

        await endDuel(roomId, winner, io, duel);
        return;
    }

    if (p1.eliminated && !p2.eliminated) {
        if (p2.points > p1.points) await endDuel(roomId, p2Id, io, duel);
    } else if (p2.eliminated && !p1.eliminated) {
        if (p1.points > p2.points) await endDuel(roomId, p1Id, io, duel);
    }
}

async function endDuel(roomId, winnerId, io, existingDuel = null) {
    const duelData = existingDuel || (await getJson(REDIS_DUEL_PREFIX + roomId));
    if (!duelData) return;

    io.to(roomId).emit('survival:stateUpdate', {
        players: serializePlayers(duelData.players),
        globalTimerEnd: duelData.globalTimerEnd
    });

    io.to(roomId).emit('survival:ended', {
        winnerId,
        players: serializePlayers(duelData.players)
    });

    try {
        await addEndMatchJob({
            roomId,
            winnerId,
            duelId: duelData.duelId,
            players: duelData.players
        });
    } catch (e) {
        console.error('Error enqueuing match result', e);
    }
    await del(REDIS_DUEL_PREFIX + roomId);
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
            p2.isBot ? null : DuelProfile.findOne({ user: p2.userId })
        ]);

        const rank1 = prof1?.survivalRank || 'Recruit';
        const rank2 = p2.isBot ? rank1 : (prof2?.survivalRank || 'Recruit');

        let questions1, questions2;
        if (rank1 === rank2) {
            const combinedExcludes = [
                ...(prof1?.survivalSeenQuestions || []),
                ...(p2.isBot ? [] : (prof2?.survivalSeenQuestions || []))
            ];

            questions1 = await getQuestionsForRank(rank1, 60, combinedExcludes);
            questions2 = [...questions1];

            // console.log(`[Survival] Fair Play match: ${p1.username} vs ${p2.username} using shared pool.`);
        } else {
            [questions1, questions2] = await Promise.all([
                getQuestionsForRank(rank1, 60, prof1?.survivalSeenQuestions || []),
                getQuestionsForRank(rank2, 60, p2.isBot ? [] : (prof2?.survivalSeenQuestions || []))
            ]);
        }

        const updateHistory = async (prof, questions) => {
            if (!prof || !questions || questions.length === 0) return;
            const newIds = questions.map(q => q._id.toString());
            const current = (prof.survivalSeenQuestions || []).map(id => id.toString());
            const filtered = current.filter(id => !newIds.includes(id));
            prof.survivalSeenQuestions = [...filtered, ...newIds].slice(-800);
            await prof.save();
        };

        await Promise.all([
            updateHistory(prof1, questions1),
            updateHistory(prof2, questions2)
        ]);

        const p1Socket = io.sockets.sockets.get(p1.socketId);
        if (p1Socket) { p1Socket.join(roomId); p1Socket.roomId = roomId; }

        let p2Socket = null;
        if (!p2.isBot) {
            p2Socket = io.sockets.sockets.get(p2.socketId);
            if (p2Socket) { p2Socket.join(roomId); p2Socket.roomId = roomId; }
        }

        const globalTimerEnd = Date.now() + DUEL_MAX_TIME + 3000;
        const p1Id = String(p1.userId);
        const p2Id = String(p2.userId);

        const matchData = {
            roomId,
            duelId: duelModel._id,
            globalTimerEnd,
            players: {
                [p1Id]: { username: p1.username, points: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false, socketId: p1.socketId, qIndex: 0, questions: questions1, rank: rank1, isDisconnected: false, isBot: false },
                [p2Id]: {
                    username: p2.username, points: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false,
                    socketId: p2.socketId, qIndex: 0, questions: questions2, rank: rank2,
                    isDisconnected: false, isBot: !!p2.isBot
                }
            },
        };

        await setJson(REDIS_DUEL_PREFIX + roomId, matchData);

        io.to(roomId).emit('survival:matched', {
            roomId,
            duelId: duelModel._id.toString(),
            players: serializePlayers(matchData.players),
            globalTimerEnd,
            ranks: { [p1Id]: rank1, [p2Id]: rank2 }
        });

        await addGlobalTimer(roomId, DUEL_MAX_TIME + 3000);
        setTimeout(() => {
            nextQuestion(roomId, p1Id, io);
            nextQuestion(roomId, p2Id, io);
        }, 5000);
    } catch (err) { console.error("Match error:", err); }
}

module.exports = function attachSurvivalSocket(io) {
    setInterval(async () => {
        const queueData = await redis.lrange(REDIS_QUEUE_KEY, 0, -1);
        if (queueData.length === 0) return;

        let parsedQueue = queueData.map(item => JSON.parse(item));
        let i = 0;
        while (i < parsedQueue.length) {
            const p1 = parsedQueue[i];
            const timeInQueue = Date.now() - p1.joinedAt;

            if (timeInQueue > 12000) {
                await redis.lrem(REDIS_QUEUE_KEY, 0, queueData[i]);
                parsedQueue.splice(i, 1);
                queueData.splice(i, 1);

                const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
                await startSurvivalDuel(p1, {
                    userId: new mongoose.Types.ObjectId(),
                    username: botName,
                    isBot: true
                }, io);
                continue;
            }

            const allowedGap = timeInQueue > 10000 ? 600 : (timeInQueue > 5000 ? 300 : 100);

            let matchedIdx = -1;
            for (let j = i + 1; j < parsedQueue.length; j++) {
                const p2 = parsedQueue[j];
                if (Math.abs(p1.elo - p2.elo) <= allowedGap) {
                    matchedIdx = j;
                    break;
                }
            }

            if (matchedIdx !== -1) {
                const p2 = parsedQueue[matchedIdx];
                await redis.multi()
                    .lrem(REDIS_QUEUE_KEY, 0, queueData[i])
                    .lrem(REDIS_QUEUE_KEY, 0, queueData[matchedIdx])
                    .exec();

                parsedQueue.splice(matchedIdx, 1);
                parsedQueue.splice(i, 1);
                queueData.splice(matchedIdx, 1);
                queueData.splice(i, 1);

                await startSurvivalDuel(p1, p2, io);
            } else {
                i++;
            }
        }
    }, 2000);

    io.on('connection', (socket) => {
        if (!socket.userId) return;

        socket.on('survival:joinQueue', async () => {
            const queueData = await redis.lrange(REDIS_QUEUE_KEY, 0, -1);
            if (queueData.find(item => JSON.parse(item).userId === socket.userId)) return;

            try {
                const profile = await DuelProfile.findOne({ user: socket.userId }).populate('user', 'nickname');
                const player = {
                    userId: socket.userId,
                    socketId: socket.id,
                    username: socket.username,
                    nickname: profile?.user?.nickname || "",
                    elo: profile?.survivalElo || 1000,
                    joinedAt: Date.now()
                };
                await redis.rpush(REDIS_QUEUE_KEY, JSON.stringify(player));
                const newLen = await redis.llen(REDIS_QUEUE_KEY);
                socket.emit('survival:queued', { position: newLen });
            } catch (err) { socket.emit('survival:error', { message: "Failed to join queue" }); }
        });

        socket.on('survival:leaveQueue', async () => {
            const queueData = await redis.lrange(REDIS_QUEUE_KEY, 0, -1);
            const playerJson = queueData.find(item => JSON.parse(item).userId === socket.userId);
            if (playerJson) {
                await redis.lrem(REDIS_QUEUE_KEY, 0, playerJson);
            }
        });

        socket.on('survival:reconnect', async ({ roomId }) => {
            const duel = await getJson(REDIS_DUEL_PREFIX + roomId);
            if (!duel) return;
            const uid = String(socket.userId);
            const p = duel.players[uid];
            if (!p || p.isBot) return;

            p.isDisconnected = false;
            p.socketId = socket.id;
            socket.roomId = roomId;

            duel.players[uid] = p;
            await setJson(REDIS_DUEL_PREFIX + roomId, duel);

            socket.join(roomId);
            io.to(roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

            if (!p.eliminated) {
                const q = p.questions && p.questions[p.qIndex];
                if (q) {
                    io.to(socket.id).emit('survival:question', {
                        index: p.qIndex, questionText: q.questionText, codeSnippet: q.codeSnippet,
                        options: q.options, type: q.type, difficulty: q.difficulty, points: q.points, timeLimit: TIME_PER_QUESTION
                    });
                }
            }
        });

        socket.on('survival:answer', async ({ roomId, selectedOptionIndex }) => {
            await evaluateAnswer(roomId, socket.userId, selectedOptionIndex, io);
        });

        socket.on('disconnect', async () => {
            const queueData = await redis.lrange(REDIS_QUEUE_KEY, 0, -1);
            const playerJson = queueData.find(item => JSON.parse(item).userId === socket.userId);
            if (playerJson) {
                await redis.lrem(REDIS_QUEUE_KEY, 0, playerJson);
            }

            if (socket.roomId) {
                const duel = await getJson(REDIS_DUEL_PREFIX + socket.roomId);
                if (duel) {
                    const p = duel.players[socket.userId];
                    if (p && !p.eliminated && !p.isBot) {
                        p.isDisconnected = true;
                        duel.players[socket.userId] = p;
                        await setJson(REDIS_DUEL_PREFIX + socket.roomId, duel);

                        io.to(socket.roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

                        setTimeout(async () => {
                            const currentDuel = await getJson(REDIS_DUEL_PREFIX + socket.roomId);
                            if (currentDuel && currentDuel.players[socket.userId]?.isDisconnected) {
                                currentDuel.players[socket.userId].eliminated = true;
                                await setJson(REDIS_DUEL_PREFIX + socket.roomId, currentDuel);
                                await checkWinConditions(socket.roomId, io);
                            }
                        }, 30000);
                    }
                }
            }
        });
    });
};

module.exports.evaluateAnswer = evaluateAnswer;
module.exports.handleGlobalTimeOut = handleGlobalTimeOut;
