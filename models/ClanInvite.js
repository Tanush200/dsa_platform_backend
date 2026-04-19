const mongoose = require('mongoose');

const ClanInviteSchema = new mongoose.Schema({
    clanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clan',
        required: true
    },
    inviterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    inviteeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending'
    }
}, { timestamps: true });

ClanInviteSchema.index({ clanId: 1, inviteeId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('ClanInvite', ClanInviteSchema);
