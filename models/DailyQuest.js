const mongoose = require('mongoose');

const DailyQuestSchema = new mongoose.Schema({
    title: { type: String, required: true },
    domain: {
        type: String,
        required: true,
        enum: ['Core CS', 'Aptitude', 'DSA', 'Development']
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SurvivalQuestion'
    }],
    status: {
        type: String,
        enum: ['Scheduled', 'Live', 'Ended', 'Completed'],
        default: 'Scheduled'
    },
    durationMinutes: { type: Number, default: 10 },
    pointsPerCorrect: { type: Number, default: 10 },
    pointsPerWrong: { type: Number, default: -2 }
}, { timestamps: true });


DailyQuestSchema.pre('save', function () {
    const now = new Date();
    if (this.status === 'Completed') return;

    if (now < this.startTime) this.status = 'Scheduled';
    else if (now >= this.startTime && now <= this.endTime) this.status = 'Live';
    else if (now > this.endTime) this.status = 'Ended';

});

module.exports = mongoose.model('DailyQuest', DailyQuestSchema);
