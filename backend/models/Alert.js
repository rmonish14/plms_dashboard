const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  nodeId: { type: String, required: true },
  type: { type: String, enum: ['Info', 'Warning', 'Critical'], required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false }
});

module.exports = mongoose.model('Alert', AlertSchema);
