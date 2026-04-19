const mongoose = require('mongoose');

const ClanMessageSchema = new mongoose.Schema({
    clanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clan',
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

ClanMessageSchema.index({ clanId: 1, timestamp: -1 });

module.exports = mongoose.model('ClanMessage', ClanMessageSchema);
