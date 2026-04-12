const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { evaluateAnswer, handleGlobalTimeOut } = require('../sockets/survivalSocket');
const { getJson } = require('../services/redis')


const SurvivalDuel = require('../models/SurvivalDuel');
const DuelProfile = require('../models/DuelProfile');
const mongoose = require('mongoose');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

const worker = new Worker('survivalQueue', async (job) => {
    const { roomId, userId, qIndex, winnerId, duelId, players: jobPlayers } = job.data;

    if (job.name === 'questionTimeout') {
        const duel = await getJson(`survival:duel:${roomId}`);
        if (duel && duel.players[userId]?.qIndex === qIndex) {
            await evaluateAnswer(roomId, userId, undefined, global.io);
        }
    }
    else if (job.name === 'globalTimeout') {
        await handleGlobalTimeOut(roomId, global.io);
    }
    else if (job.name === 'saveMatchResult') {
        try {
            const finalPlayers = Object.keys(jobPlayers).map(uid => ({
                user: jobPlayers[uid].isBot ? null : uid,
                points: jobPlayers[uid].points,
                streak: jobPlayers[uid].bestStreak || 0,
                eliminated: jobPlayers[uid].eliminated
            }));

            await SurvivalDuel.findByIdAndUpdate(duelId, {
                status: 'finished',
                winner: winnerId,
                players: finalPlayers,
                finishedAt: new Date()
            });

            const playerIds = Object.keys(jobPlayers);
            const isTie = !winnerId;
            const profiles = {};

            for (const uid of playerIds) {
                if (jobPlayers[uid].isBot) continue;
                let pProfile = await DuelProfile.findOne({ user: uid });
                if (!pProfile) { pProfile = new DuelProfile({ user: uid }); await pProfile.save(); }
                profiles[uid] = pProfile;
            }

            const K = 32;
            if (playerIds.length === 2) {
                const [aId, bId] = playerIds;
                for (const uid of [aId, bId]) {
                    const p = jobPlayers[uid];
                    if (p.isBot) continue;

                    const oppId = uid === aId ? bId : aId;
                    const opp = jobPlayers[oppId];
                    const prof = profiles[uid];
                    const elo = prof.survivalElo || 1000;
                    const oppElo = opp.isBot ? elo : (profiles[oppId]?.survivalElo || 1000);

                    const expected = 1 / (1 + Math.pow(10, (oppElo - elo) / 400));
                    let score = 0.5;
                    if (!isTie && String(winnerId) === String(uid)) score = 1;
                    else if (!isTie && String(winnerId) === String(oppId)) score = 0;

                    const newElo = Math.max(100, Math.round(elo + K * (score - expected)));
                    const delta = newElo - elo;

                    prof.survivalElo = newElo;
                    prof.survivalTotalDuels = (prof.survivalTotalDuels || 0) + 1;
                    if (score === 1) prof.survivalWins = (prof.survivalWins || 0) + 1;
                    else if (score === 0) prof.survivalLosses = (prof.survivalLosses || 0) + 1;
                    prof.survivalBestStreak = Math.max(prof.survivalBestStreak || 0, p.bestStreak);

                    if (p.questions && p.qIndex > 0) {
                        const newSeenIds = p.questions.slice(0, p.qIndex + 1).map(q => q._id.toString());
                        const currentSeen = (prof.survivalSeenQuestions || []).map(id => id.toString());
                        const filteredHistory = currentSeen.filter(id => !newSeenIds.includes(id));
                        prof.survivalSeenQuestions = [...filteredHistory, ...newSeenIds].slice(-800);
                    }

                    const istNow = new Date();
                    const istTodayStr = istNow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    const istYesterday = new Date(istNow);
                    istYesterday.setDate(istYesterday.getDate() - 1);
                    const istYesterdayStr = istYesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

                    const userHistory = prof.survivalActivityHistory || [];
                    if (!userHistory.includes(istTodayStr)) {
                        if (userHistory.includes(istYesterdayStr)) {
                            prof.dailyStreak = (prof.dailyStreak || 0) + 1;
                        } else {
                            prof.dailyStreak = 1;
                        }
                        prof.lastDailyStreakAt = istNow;
                        prof.survivalActivityHistory.push(istTodayStr);
                        if (prof.survivalActivityHistory.length > 365) prof.survivalActivityHistory.shift();
                    }

                    prof.lastDuelAt = istNow;
                    await prof.save();

                    if (global.io) {
                        const userSocketId = p.socketId;
                        if (userSocketId) {
                            global.io.to(userSocketId).emit('survival:eloUpdate', {
                                newElo,
                                delta,
                                rank: prof.survivalRank,
                                dailyStreak: prof.dailyStreak
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[Survival Worker] Save Match error:', err);
        }
    }
}, { connection });

worker.on('error', (err) => console.error('BullMQ error:', err));

console.log('BullMQ Survival Worker started successfully');