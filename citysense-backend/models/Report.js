const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional - anonymous allowed

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    area: { type: String, required: true, trim: true, maxlength: 80 },

    issueType: {
      type: String,
      enum: ['factory', 'traffic', 'construction', 'burning', 'other'],
      required: true,
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    photoUrl: { type: String, default: '' },

    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    // Track who voted to prevent duplicate votes
    voters: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        vote: { type: String, enum: ['up', 'down'] },
      },
    ],

    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved'],
      default: 'open',
    },
  },
  { timestamps: true }
);

reportSchema.index({ location: '2dsphere' });
reportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
