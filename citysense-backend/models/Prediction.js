const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    area: { type: String, default: 'Unknown' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
    forTimestamp: { type: Date, required: true }, // the hour being predicted
    predictedAqi: { type: Number, required: true },
    actualAqi: { type: Number }, // filled in later once that hour passes
    accuracy: { type: Number }, // computed once actual is known
  },
  { timestamps: true }
);

predictionSchema.index({ forTimestamp: 1 });

module.exports = mongoose.model('Prediction', predictionSchema);
