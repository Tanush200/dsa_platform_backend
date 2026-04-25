const mongoose = require('mongoose');
const SurvivalDuel = require('../models/SurvivalDuel');
const SurvivalQuestion = require('../models/SurvivalQuestion');
const DuelProfile = require('../models/DuelProfile');
const { v4: uuidv4 } = require('uuid');
const { redis, getJson, setJson, del } = require('../services/redis');
const {
    addQuestionTimer,
    addGlobalTimer,
    addEndMatchJob,
    addBotTurn,
    addAbandonmentTimer
} = require('../services/survivalQueue');
const { recordSolve } = require('../services/userActivityService');
const logger = require('../utils/logger');
const { getPercentile } = require('../services/statsService');



const REDIS_QUEUE_PREFIX = 'survival:queue:';
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



async function getQuestionsForRank(rank, count = 50, excludeIds = [], domain = 'cs') {
    const difficulties = RANK_DIFFICULTY[rank] || ['Easy'];

    const getQuery = (diffArr, targetDomain) => ({
        active: true,
        difficulty: { $in: diffArr },
        domain: targetDomain
    });

    const totalCount = await SurvivalQuestion.countDocuments(getQuery(difficulties, domain));

    let finalExcludeIds = excludeIds;

    if (excludeIds.length >= (totalCount * 0.8) && totalCount > 0) {
        const keepCount = Math.floor(totalCount * 0.2);
        finalExcludeIds = excludeIds.slice(-keepCount);
    }

    const ninIds = finalExcludeIds.map(id => {
        try { return new mongoose.Types.ObjectId(id); } catch (e) { return id; }
    });

    let questions = await SurvivalQuestion.aggregate([
        { $match: { ...getQuery(difficulties, domain), _id: { $nin: ninIds } } },
        { $sample: { size: count } }
    ]);

    if (questions.length < 5) {
        questions = await SurvivalQuestion.aggregate([
            { $match: { active: true, domain: domain, _id: { $nin: ninIds } } },
            { $sample: { size: count } }
        ]);
    }

    if (questions.length === 0) {
        questions = await SurvivalQuestion.aggregate([
            { $match: { active: true, domain: domain } },
            { $sample: { size: count } }
        ]);
    }

    return questions;
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
            username: p.username,
            nickname: p.nickname || '',
            points: p.points,
            streak: p.streak,
            bestStreak: p.bestStreak || 0,
            lives: p.lives,
            eliminated: p.eliminated,
            qIndex: p.qIndex,
            qCount: p.questions?.length || 0,
            isConnected: p.isBot ? true : !p.isDisconnected,
            isBot: !!p.isBot,
            rank: p.rank,
            correctCount: p.correctCount || 0,
            totalAttempted: p.totalAttempted || 0,
            accuracy: p.totalAttempted > 0 ? Math.round((p.correctCount / p.totalAttempted) * 100) : 0
        };
    }
    return result;
}



async function triggerMatchStart(roomId, io) {
    const duel = await getJson(REDIS_DUEL_PREFIX + roomId);
    if (!duel || duel.matchStarted) return;

    duel.matchStarted = true;
    await setJson(REDIS_DUEL_PREFIX + roomId, duel);

    const pIds = Object.keys(duel.players);
    for (const uid of pIds) {
        await nextQuestion(roomId, uid, io);
    }
}

async function handleGlobalTimeOut(roomId, io) {
    let lockAcquired = false;
    for (let i = 0; i < 5; i++) {
        if (await acquireLock(roomId)) {
            lockAcquired = true;
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    if (!lockAcquired) return;

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
            domain: q.domain || 'cs',
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

    await addBotTurn(roomId, botId, delay);
}

async function runBotTurnLogic(roomId, botId, io) {
    const currentDuel = await getJson(REDIS_DUEL_PREFIX + roomId);
    if (!currentDuel || currentDuel.players[botId]?.eliminated) return;

    const p = currentDuel.players[botId];
    const q = p.questions[p.qIndex];
    if (!q) return;

    const config = BOT_CONFIG[p.rank] || BOT_CONFIG.Recruit;
    const accuracy = config.accuracy[q.difficulty] || 0.5;
    const isCorrect = Math.random() < accuracy;
    const answerIndex = isCorrect ? q.correctAnswer : (q.correctAnswer + 1) % q.options.length;

    await evaluateAnswer(roomId, botId, answerIndex, io);
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
    let lockAcquired = false;
    for (let i = 0; i < 5; i++) {
        if (await acquireLock(roomId)) {
            lockAcquired = true;
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    if (!lockAcquired) return;

    try {
        let duel = await getJson(REDIS_DUEL_PREFIX + roomId);
        if (!duel) return;

        if (duel.globalTimerEnd && Date.now() >= duel.globalTimerEnd) {
            await handleGlobalTimeOut(roomId, io);
            return;
        }

        const p = duel.players[userId];
        if (!p || p.eliminated) return;
        
        p.isProcessing = true;
        p.totalAttempted = (p.totalAttempted || 0) + 1;

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
            p.correctCount = (p.correctCount || 0) + 1;
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

    // Case 1: Both strictly finished or eliminated
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

    // Case 2: Mathematical Victory or Early Closure
    if (p1.eliminated && !p2.eliminated) {
        const remainingQ = (p2.questions?.length || 0) - p2.qIndex;
        const maxPossiblePoints = p2.points + (remainingQ * 10);

        if (p2.points > p1.points || maxPossiblePoints < p1.points) {
            await endDuel(roomId, p2.points > p1.points ? p2Id : p1Id, io, duel);
        }
    } else if (p2.eliminated && !p1.eliminated) {
        const remainingQ = (p1.questions?.length || 0) - p1.qIndex;
        const maxPossiblePoints = p1.points + (remainingQ * 10);

        if (p1.points > p2.points || maxPossiblePoints < p2.points) {
            await endDuel(roomId, p1.points > p2.points ? p1Id : p2Id, io, duel);
        }
    }
}

async function endDuel(roomId, winnerId, io, existingDuel = null) {
    const duelData = existingDuel || (await getJson(REDIS_DUEL_PREFIX + roomId));
    if (!duelData) return;

    io.to(roomId).emit('survival:stateUpdate', {
        players: serializePlayers(duelData.players),
        globalTimerEnd: duelData.globalTimerEnd
    });

    const playerIds = Object.keys(duelData.players);
    const percentileResults = {};
    for (const uid of playerIds) {
        if (!duelData.players[uid].isBot) {
            percentileResults[uid] = await getPercentile(uid, 'survival');
        }
    }

    io.to(roomId).emit('survival:ended', {
        winnerId,
        domain: duelData.domain || 'cs',
        players: serializePlayers(duelData.players),
        percentileResults
    });

    try {
        await addEndMatchJob({
            roomId,
            winnerId,
            duelId: duelData.duelId,
            domain: duelData.domain || 'cs',
            players: duelData.players
        });
    } catch (e) {
        console.error('Error enqueuing match result', e);
    }
    await del(REDIS_DUEL_PREFIX + roomId);
}



async function startSurvivalDuel(p1, p2, io, domain = 'cs') {
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

            questions1 = await getQuestionsForRank(rank1, 100, combinedExcludes, domain);
            questions2 = [...questions1];
        } else {
            [questions1, questions2] = await Promise.all([
                getQuestionsForRank(rank1, 100, prof1?.survivalSeenQuestions || [], domain),
                getQuestionsForRank(rank2, 100, p2.isBot ? [] : (prof2?.survivalSeenQuestions || []), domain)
            ]);
        }

        if (!questions1.length || !questions2.length) {
            const errorMsg = `Sector ${domain.toUpperCase()} currently has no available challenges. Try the CS Core.`;
            io.to(p1.socketId).emit('survival:error', { message: errorMsg });
            if (!p2.isBot) io.to(p2.socketId).emit('survival:error', { message: errorMsg });

            logger.error(`[Survival] Match Ignition Aborted for ${roomId} - Domain Empty: ${domain}`);
            await SurvivalDuel.findByIdAndDelete(duelModel._id);
            return;
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
            domain,
            globalTimerEnd,
            matchStarted: false,
            players: {
                [p1Id]: { username: p1.username, nickname: p1.nickname, points: 0, correctCount: 0, totalAttempted: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false, socketId: p1.socketId, qIndex: 0, questions: questions1, rank: rank1, isDisconnected: false, isBot: false, isReady: false },
                [p2Id]: {
                    username: p2.username, nickname: p2.nickname, points: 0, correctCount: 0, totalAttempted: 0, streak: 0, bestStreak: 0, lives: 4, eliminated: false,
                    socketId: p2.socketId, qIndex: 0, questions: questions2, rank: rank2,
                    isDisconnected: false, isBot: !!p2.isBot, isReady: !!p2.isBot
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
            triggerMatchStart(roomId, io);
        }, 2000);
    } catch (err) { logger.error(err, "Match error"); }
}

module.exports = function attachSurvivalSocket(io) {
    const DOMAINS = ['cs', 'aptitude', 'gk', 'ece', 'me', 'ce', 'upsc'];

    setInterval(async () => {
        for (const domain of DOMAINS) {
            const queueKey = REDIS_QUEUE_PREFIX + domain;
            const queueData = await redis.lrange(queueKey, 0, 50);
            if (queueData.length === 0) continue;

            let parsedQueue = queueData.map(item => JSON.parse(item));
            let matchedUserIds = new Set();

            for (let i = 0; i < parsedQueue.length - 1; i++) {
                if (matchedUserIds.has(parsedQueue[i].userId)) continue;

                const p1 = parsedQueue[i];
                const timeInQueue = Date.now() - p1.joinedAt;

                const allowedGap = timeInQueue > 10000 ? 2000 : (timeInQueue > 5000 ? 300 : 100);

                for (let j = i + 1; j < parsedQueue.length; j++) {
                    if (matchedUserIds.has(parsedQueue[j].userId)) continue;

                    const p2 = parsedQueue[j];
                    if (Math.abs(p1.elo - p2.elo) <= allowedGap) {
                        matchedUserIds.add(p1.userId);
                        matchedUserIds.add(p2.userId);

                        await redis.multi()
                            .lrem(queueKey, 0, queueData[i])
                            .lrem(queueKey, 0, queueData[j])
                            .exec();

                        await startSurvivalDuel(p1, p2, io, domain);
                        logger.debug(`[Survival] Human Match: ${p1.username} vs ${p2.username} in ${domain}`);
                        break;
                    }
                }
            }

            const finalQueueData = await redis.lrange(queueKey, 0, 0);
            const headStr = finalQueueData[0];
            if (headStr) {
                const head = JSON.parse(headStr);
                if (Date.now() - head.joinedAt > 12000) {
                    const removedCount = await redis.lrem(queueKey, 1, headStr);
                    if (removedCount > 0) {
                        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
                        await startSurvivalDuel(head, {
                            userId: new mongoose.Types.ObjectId(),
                            username: botName,
                            isBot: true
                        }, io, domain);
                        logger.debug(`[Survival] Bot Match for ${head.username} in ${domain}`);
                    }
                }
            }
        }
    }, 1000);

    io.use(async (socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.query?.token;
            if (!token) return next(new Error('Authentication required'));

            const jwt = require('jsonwebtoken');
            const secret = process.env.JWT_SECRET;
            if (!secret) return next(new Error('Internal Security Error: Missing Key'));
            const decoded = jwt.verify(token, secret);

            if (decoded.type !== 'socket_admission') {
                return next(new Error('Invalid token type for socket access'));
            }

            const User = require('../models/User');
            const user = await User.findById(decoded.id);
            if (!user) return next(new Error('User identity not found in registry'));
            if (!user.isVerified) return next(new Error('Identity verification required'));

            socket.userId = decoded.id;
            socket.username = decoded.username;
            next();
        } catch (err) {
            next(new Error('Invalid token or verification failed'));
        }
    });

    io.on('connection', (socket) => {
        if (!socket.userId) return;
        socket.join(socket.userId);

        socket.on('survival:joinQueue', async (data) => {
            const domain = data?.domain || 'cs';
            const queueKey = REDIS_QUEUE_PREFIX + domain;

            const queueData = await redis.lrange(queueKey, 0, -1);

            const existingEntry = queueData.find(item => JSON.parse(item).userId === socket.userId);
            if (existingEntry) {
                const currentLen = await redis.llen(queueKey);
                socket.emit('survival:queued', { position: currentLen });
                return;
            }

            try {
                const profile = await DuelProfile.findOne({ user: socket.userId }).populate('user', 'nickname');

                let elo = profile?.survivalElo || 1000;
                if (domain !== 'cs' && profile?.domainStats) {
                    const stats = profile.domainStats.get(domain);
                    if (stats) elo = stats.elo;
                }

                const player = {
                    userId: socket.userId,
                    socketId: socket.id,
                    username: socket.username,
                    nickname: profile?.user?.nickname || "",
                    elo,
                    domain,
                    joinedAt: Date.now()
                };

                await redis.rpush(queueKey, JSON.stringify(player));
                const newLen = await redis.llen(queueKey);
                socket.emit('survival:queued', { position: newLen });
                logger.debug(`[Survival] User ${socket.userId} joined ${domain} queue.`);
            } catch (err) {
                logger.error(err, "Failed to join queue");
                socket.emit('survival:error', { message: "Failed to join queue" });
            }
        });

        socket.on('survival:leaveQueue', async () => {
            const DOMAINS = ['cs', 'aptitude', 'gk', 'ece', 'me', 'ce', 'upsc'];
            for (const domain of DOMAINS) {
                const queueKey = REDIS_QUEUE_PREFIX + domain;
                const queueData = await redis.lrange(queueKey, 0, -1);
                const playerStr = queueData.find(item => JSON.parse(item).userId === socket.userId);
                if (playerStr) await redis.lrem(queueKey, 0, playerStr);
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
            p.isReady = true;
            socket.roomId = roomId;

            duel.players[uid] = p;
            await setJson(REDIS_DUEL_PREFIX + roomId, duel);

            socket.join(roomId);


            const allPlayers = Object.values(duel.players);
            const allReady = allPlayers.every(pl => pl.isBot || pl.isReady);

            if (allReady && !duel.matchStarted) {
                await triggerMatchStart(roomId, io);
                return;
            }

            io.to(roomId).emit('survival:stateUpdate', { players: serializePlayers(duel.players), globalTimerEnd: duel.globalTimerEnd });

            if (!p.eliminated) {
                const q = p.questions && p.questions[p.qIndex];
                if (q) {
                    io.to(socket.id).emit('survival:question', {
                        index: p.qIndex, questionText: q.questionText, codeSnippet: q.codeSnippet,
                        options: q.options, type: q.type, difficulty: q.difficulty, points: q.points, timeLimit: TIME_PER_QUESTION,
                        domain: q.domain || 'cs'
                    });
                }
            }
        });

        socket.on('survival:answer', async ({ roomId, selectedOptionIndex }) => {
            await evaluateAnswer(roomId, socket.userId, selectedOptionIndex, io);
        });

        socket.on('disconnect', async () => {
            const DOMAINS = ['cs', 'aptitude', 'gk', 'ece', 'me', 'ce', 'upsc'];
            for (const domain of DOMAINS) {
                const queueKey = REDIS_QUEUE_PREFIX + domain;
                const queueData = await redis.lrange(queueKey, 0, -1);
                const playerStr = queueData.find(item => JSON.parse(item).userId === socket.userId);
                if (playerStr) await redis.lrem(queueKey, 0, playerStr);
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

                        await addAbandonmentTimer(socket.roomId, socket.userId, 30000);
                        logger.warn(`[Survival] User ${socket.userId} disconnected from match ${socket.roomId}. Abandonment timer started.`);
                    }
                }
            }
        });
    });
};

module.exports.evaluateAnswer = evaluateAnswer;
module.exports.handleGlobalTimeOut = handleGlobalTimeOut;
module.exports.runBotTurnLogic = runBotTurnLogic;
module.exports.setJson = setJson;
module.exports.checkWinConditions = checkWinConditions;