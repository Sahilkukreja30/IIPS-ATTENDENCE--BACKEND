const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Students',
    required: true
  },
  subjectCode: {
    type: String,
    required: true
  },
  currAcademicYear: {
    type: String,
    required: true,
    default: "2025-26"
  },
  records: [
    {
      date: { type: Date, required: true },
      present: { type: Boolean, required: true },
      markedBy: { type: String, default: null }, // now at record level
      markedAt: { type: Date, default: Date.now } // timestamp for each record
    }
  ]
}, { timestamps: true });

// Composite index for fast lookups
attendanceSchema.index({ studentId: 1, subjectCode: 1, currAcademicYear: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
