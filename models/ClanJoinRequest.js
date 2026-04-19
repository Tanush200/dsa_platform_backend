const mongoose = require('mongoose');

const ClanJoinRequestSchema = new mongoose.Schema({
    clanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clan',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'declined'],
        default: 'pending'
    },
    message: {
        type: String,
        trim: true,
        maxlength: 200
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

ClanJoinRequestSchema.index({ clanId: 1, userId: 1, status: 1 }, {
    unique: true,
    partialFilterExpression: { status: 'pending' }
});

module.exports = mongoose.model('ClanJoinRequest', ClanJoinRequestSchema);
