const mongoose = require('mongoose');

const NodeDataSchema = new mongoose.Schema({
  nodeId: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, index: true },
  metrics: {
    aqi: Number,
    pm1_0: Number,
    pm2_5: Number,
    pm10: Number,
    co: Number,
    co2: Number,
    temperature: Number,
    humidity: Number
  }
});

// For time-series optimization queries if necessary
NodeDataSchema.index({ nodeId: 1, timestamp: -1 });

module.exports = mongoose.model('NodeData', NodeDataSchema);
