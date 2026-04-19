const express = require('express');
const router = express.Router();
const clanController = require('../controllers/clanController');
const { auth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');


const inductionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: 'Tactical signal threshold reached. Please wait for signal clearance.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const directiveLimiter = rateLimit({
    windowMs: 30 * 1000,
    max: 2,
    message: { message: 'Strategic directive instability detected. Throttling updates.' }
});

router.post('/request', auth, inductionLimiter, clanController.requestToJoin);
router.get('/requests', auth, clanController.getJoinRequests);
router.post('/handle-request', auth, clanController.handleJoinRequest);

router.post('/', auth, clanController.createClan);
router.get('/leaderboard', clanController.getClanLeaderboard);
router.get('/invites/my', auth, clanController.getMyInvites);
router.get('/logs', auth, clanController.getClanLogs);
router.get('/:id', clanController.getClanDetails);

router.post('/invite', auth, inductionLimiter, clanController.inviteToClan);
router.post('/kick', auth, clanController.kickMember);
router.post('/invite/:id/accept', auth, clanController.acceptInvite);
router.post('/leave', auth, clanController.leaveClan);
router.post('/transfer-leadership', auth, clanController.transferLeadership);
router.post('/update-description', auth, auth, directiveLimiter, clanController.updateClanDescription);
router.get('/:id/messages', auth, clanController.getClanMessages);
router.get('/:id/intel', auth, clanController.getClanIntel);

module.exports = router;
