const mongoose = require('mongoose');

const ClanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 25
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        index: true
    },
    tag: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        minlength: 3,
        maxlength: 4
    },
    description: {
        type: String,
        maxlength: 200,
        default: "A new elite tactical clan."
    },
    leader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    totalPoints: {
        type: Number,
        default: 0,
        index: true
    },

    weeklyPoints: {
        type: Number,
        default: 0,
        index: true
    },
    level: {
        type: Number,
        default: 1
    },
    blacklist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, { timestamps: true });

module.exports = mongoose.model('Clan', ClanSchema);
