const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const badgeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // e.g. 'explorer', 'eco_warrior'
    name: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // never return by default
    },

    // Health profile
    age: { type: Number, min: 1, max: 120 },
    healthConditions: {
      type: [String],
      enum: ['asthma', 'heart', 'pregnant', 'child', 'elderly', 'none'],
      default: ['none'],
    },

    // Gamification
    points: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckIn: { type: Date },
    badges: { type: [badgeSchema], default: [] },

    // Preferences
    aqiAlertThreshold: { type: Number, default: 150 },
    homeArea: { type: String, default: '' },
    homeLat: { type: Number },
    homeLng: { type: Number },

    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true },

    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  { timestamps: true }
);

// ---- Indexes ----
userSchema.index({ points: -1 });

// ---- Hash password before save ----
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = Date.now() - 1000;
  next();
});

// ---- Instance methods ----
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
