const User = require('../models/User');

/**
 * Records a solve for a user, updating solve history and streaks based on Asia/Kolkata (IST).
 * @param {string} userId
 * @param {number} count - number of solves to add (defaults to 1)
 */
async function recordSolve(userId, count = 1) {
    try {
        const user = await User.findById(userId);
        if (!user) return null;

        if (!user.solveHistory) user.solveHistory = [];

        // 1. Get current date string in IST (YYYY-MM-DD)
        const istNow = new Date();
        const istTodayStr = istNow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        if (user.lastSolvedDate) {
            const lastSolved = new Date(user.lastSolvedDate);
            const lastSolvedStr = lastSolved.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            if (istTodayStr === lastSolvedStr) {
                // Already solved today in IST, streak remains same
            } else {
                // Determine if it was exactly yesterday in IST
                const yesterday = new Date(istNow);
                yesterday.setDate(yesterday.getDate() - 1);
                const istYesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

                if (lastSolvedStr === istYesterdayStr) {
                    // Consecutive day in IST
                    user.currentStreak = (user.currentStreak || 0) + 1;
                } else {
                    // Streak broken
                    user.currentStreak = 1;
                }
                user.lastSolvedDate = istNow;
            }
        } else {
            // First solve ever
            user.currentStreak = 1;
            user.lastSolvedDate = istNow;
        }

        if (user.currentStreak > (user.maxStreak || 0)) {
            user.maxStreak = user.currentStreak;
        }

        // 2. Update solve history using IST date
        const existingDay = user.solveHistory.find(d => d.date === istTodayStr);
        if (existingDay) {
            existingDay.count += count;
        } else {
            user.solveHistory.push({ date: istTodayStr, count: count });
        }

        // Keep last 500 days of history
        if (user.solveHistory.length > 500) {
            user.solveHistory = user.solveHistory.slice(-500);
        }

        user.markModified('solveHistory');
        await user.save();
        return user;
    } catch (err) {
        console.error("Error in recordSolve service:", err);
        return null;
    }
}

module.exports = {
    recordSolve
};
