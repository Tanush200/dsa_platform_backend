const mongoose = require('mongoose');

const ClanLogSchema = new mongoose.Schema({
    clanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clan',
        required: true,
        index: true
    },
    action: {
        type: String,
        enum: ['JOIN', 'LEAVE', 'KICK', 'TRANSFER', 'DESCRIPTION_UPDATE', 'INVITE'],
        required: true
    },
    operatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    details: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('ClanLog', ClanLogSchema);
