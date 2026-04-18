const DuelProfile = require('../models/DuelProfile');

/**
 * Calculates the percentile standing of a user based on their ELO.
 * @param {string} userId - The user's ID
 * @param {string} mode - 'survival' or 'casual'
 * @returns {Promise<{percentile: number, beatenCount: number, totalPlayers: number}>}
 */
async function getPercentile(userId, mode = 'survival') {
    try {
        const field = mode === 'survival' ? 'survivalElo' : 'elo';
        const profile = await DuelProfile.findOne({ user: userId });
        
        if (!profile) {
            return { percentile: 0, beatenCount: 0, totalPlayers: 0 };
        }

        const userElo = profile[field] || 1000;

        // Count all players who have played at least one match in this mode
        // (Assuming totalDuels > 0 means they are active in that mode)
        const totalPlayersQuery = mode === 'survival' 
            ? { survivalTotalDuels: { $gt: 0 } }
            : { totalDuels: { $gt: 0 } };

        const totalPlayers = await DuelProfile.countDocuments(totalPlayersQuery);
        
        if (totalPlayers === 0) {
            return { percentile: 100, beatenCount: 0, totalPlayers: 0 };
        }

        // Count players with lower ELO
        const beatenCountQuery = {
            ...totalPlayersQuery,
            [field]: { $lt: userElo }
        };

        const beatenCount = await DuelProfile.countDocuments(beatenCountQuery);

        // Calculate percentile: (beatenCount / totalPlayers) * 100
        const percentile = Math.min(99, Math.floor((beatenCount / totalPlayers) * 100));

        return {
            percentile: percentile === 0 && userElo > 1000 ? 1 : percentile, // Give a bit of credit if they've improved
            beatenCount,
            totalPlayers
        };
    } catch (error) {
        console.error('Error calculating percentile:', error);
        return { percentile: 0, beatenCount: 0, totalPlayers: 0 };
    }
}

module.exports = { getPercentile };
