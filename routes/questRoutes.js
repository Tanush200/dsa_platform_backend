const express = require('express');
const router = express.Router();
const questController = require('../controllers/questController');
const { auth } = require('../middleware/auth');
const { noCache } = require('../middleware/cache');

router.use(noCache);

router.get('/', auth, questController.getQuests);
router.get('/stats', auth, questController.getUserQuestStats);
router.get('/:id', auth, questController.getQuestById);
router.post('/submit', auth, questController.submitQuest);
router.get('/:id/leaderboard', auth, questController.getLeaderboard);

router.post('/', auth, questController.createQuest);
router.delete('/:id', auth, questController.deleteQuest);
router.post('/:id/calculate', auth, questController.forceCalculateLeaderboard);
router.get('/:id/admin/submissions', auth, questController.getAdminSubmissions);

module.exports = router;
