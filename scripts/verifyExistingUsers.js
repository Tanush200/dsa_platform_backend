const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected for migration');

        const result = await User.updateMany(
            { isVerified: { $ne: true } },
            { $set: { isVerified: true } }
        );

        console.log(`Migration complete. ${result.modifiedCount} users verified.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
