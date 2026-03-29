const mongoose = require('mongoose');

const NodeSchema = new mongoose.Schema({
  nodeId: { type: String, required: true, unique: true },
  name: { type: String, default: 'Unknown Node' },
  status: { type: String, enum: ['Online', 'Offline'], default: 'Offline' },
  location: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 }
  },
  lastSeen: { type: Date, default: Date.now },
  firmwareVersion: { type: String, default: '1.0.0' }
}, { timestamps: true });

module.exports = mongoose.model('Node', NodeSchema);
