const Student = require("../models/Student"); // adjust path
const Course = require('../models/Course');
const mongoose = require("mongoose");

// Roll number pattern validation function
const isValidRollNumber = (rollNumber) => {
  if (!rollNumber || typeof rollNumber !== "string") return false;

  const cleanedRollNumber = rollNumber.trim().toUpperCase();

  // Pattern: 2 letters + "-2K" + 2 digits + "-" + numbers
  // Examples: IT-2K21-36, CS-2K22-150
  const pattern = /^[A-Z]{2}-2K\d{2}-\d+$/;
  return pattern.test(cleanedRollNumber);
};

// Helper function to convert empty strings to null
const convertEmptyToNull = (value) => {
  if (value === "" || value === undefined) return null;
  return value;
};

// Helper function to process student data
const processStudentData = (data) => {
  const processed = {};

  // Required fields
  if (data.rollNumber !== undefined) {
    processed.rollNumber = data.rollNumber ? data.rollNumber.toUpperCase() : null;
  }
  if (data.fullName !== undefined) {
    processed.fullName = convertEmptyToNull(data.fullName);
  }
  if (data.courseId !== undefined) {
    processed.courseId = convertEmptyToNull(data.courseId);
  }
  if (data.semId !== undefined) {
    processed.semId = data.semId || null;
  }

  // Optional fields
  if (data.email !== undefined) {
    processed.email = convertEmptyToNull(data.email);
  }
  if (data.phoneNumber !== undefined) {
    processed.phoneNumber = convertEmptyToNull(data.phoneNumber);
  }
  if (data.section !== undefined) {
    processed.section = convertEmptyToNull(data.section);
  }
  if (data.specializations !== undefined) {
    // Handle specializations array - remove empty strings
    if (Array.isArray(data.specializations)) {
      const filtered = data.specializations.filter(spec => spec !== "" && spec !== null && spec !== undefined);
      processed.specializations = filtered.length > 0 ? filtered : null;
    } else if (data.specializations === "") {
      processed.specializations = null;
    } else {
      processed.specializations = data.specializations;
    }
  }

  return processed;
};

// ---------------- CREATE ----------------
exports.createStudent = async (req, res) => {
  try {
    const { rollNumber, fullName, courseName, semId, email, phoneNumber, section, specializations } = req.body;

    // Validate required fields
    if (!rollNumber || !fullName || !courseName || !semId) {
      return res.status(400).json({
        message: "Roll number, full name, course name, and semester ID are required",
      });
    }

    if (!isValidRollNumber(rollNumber?.trim())) {
      return res.status(400).json({
        message: "Invalid roll number format. Use XX-2KYY-NNN (e.g., IT-2K21-36)",
      });
    }

    // ✅ Find course ID using course name
    const course = await Course.findOne({ Course_Name: courseName }, { Course_Id: 1 }).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const existing = await Student.findOne({ rollNumber: rollNumber.toUpperCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "Student with this roll number already exists" });
    }

    // Process the data to handle empty strings
    const studentData = processStudentData({
      rollNumber,
      fullName,
      courseId: course.Course_Id,   // ✅ resolved from courseName
      semId,
      email,
      phoneNumber,
      section,
      specializations: specializations?.length ? specializations : null // store null if []
    });

    const student = new Student(studentData);
    const saved = await student.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create error:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        details: Object.keys(err.errors).map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
    res.status(500).json({ message: "Failed to create student" });
  }
};


// ---------------- READ ----------------
exports.getStudents = async (req, res) => {
  try {
    const students = await Student.find();
    res.status(200).json(students);
  } catch (err) {
    console.error("Read error:", err);
    res.status(500).json({ message: "Failed to fetch students" });
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (err) {
    console.error("Get by ID error:", err);
    res.status(500).json({ message: "Failed to fetch student" });
  }
};

// ---------------- UPDATE ----------------
exports.updateStudent = async (req, res) => {
  try {
    const { rollNumber } = req.body;

    if (rollNumber && !isValidRollNumber(rollNumber)) {
      return res.status(400).json({
        message: "Invalid roll number format. Use XX-2KYY-NNN (e.g., IT-2K21-36)",
      });
    }

    // Process the update data to handle empty strings
    const updateData = processStudentData(req.body);

    // Remove undefined values to avoid overwriting existing data
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const updated = await Student.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Student not found" });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update error:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        details: Object.keys(err.errors).map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
    res.status(500).json({ message: "Failed to update student" });
  }
};

// ---------------- DELETE ----------------
exports.deleteStudent = async (req, res) => {
  try {
    const deleted = await Student.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Failed to delete student" });
  }
};


// ===================== PROMOTE STUDENTS TO NEXT SEMESTER =====================
exports.promoteStudentsToNextSemester = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        message: "studentIds must be a non-empty array",
      });
    }

    const students = await Student.find({
      _id: { $in: studentIds },
    }).session(session);

    if (!students.length) {
      return res.status(404).json({ message: "No valid students found" });
    }

    const promoted = [];
    const skipped = [];

    for (const student of students) {
      const course = await Course.findOne(
        { Course_Id: student.courseId },
        { No_of_Sem: 1 }
      ).session(session);

      if (!course) {
        skipped.push({ studentId: student._id, reason: "Course not found" });
        continue;
      }

      const currentSem = parseInt(student.semId, 10);
      if (isNaN(currentSem)) {
        skipped.push({ studentId: student._id, reason: "Invalid semester" });
        continue;
      }

      if (currentSem >= course.No_of_Sem) {
        skipped.push({ studentId: student._id, reason: "Final semester" });
        continue;
      }

      const nextSem = currentSem + 1;

      let nextAcademicYear = student.academicYear;

      // 🔥 EVEN → ODD ⇒ academic year changes
      if (currentSem % 2 === 0) {
        const [start] = student.academicYear.split("-");
        const newStart = parseInt(start, 10) + 1;
        nextAcademicYear = `${newStart}-${(newStart + 1)
          .toString()
          .slice(-2)}`;
      }

      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            semId: nextSem.toString(),
            academicYear: nextAcademicYear,
          },
        },
        { session }
      );

      promoted.push({
        studentId: student._id,
        fromSem: currentSem,
        toSem: nextSem,
        academicYear: nextAcademicYear,
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Students promoted successfully",
      summary: {
        requested: studentIds.length,
        promoted: promoted.length,
        skipped: skipped.length,
      },
      promoted,
      skipped,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Promotion error:", error);
    return res.status(500).json({
      success: false,
      message: "Promotion failed",
      error: error.message,
    });
  }
};
// ===================== ROLLBACK STUDENT PROMOTION =====================
const Attendance = require("../models/Attendance");

// ===================== MANUAL ROLLBACK (ADMIN OVERRIDE) =====================
exports.rollbackStudents = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { studentIds, resetAttendance = false } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        message: "studentIds must be a non-empty array"
      });
    }

    const students = await Student.find({
      _id: { $in: studentIds }
    }).session(session);

    const rolledBack = [];
    const skipped = [];

    for (const student of students) {
      const currentSem = parseInt(student.semId, 10);

      if (isNaN(currentSem)) {
        skipped.push({
          studentId: student._id,
          reason: "Invalid semester value"
        });
        continue;
      }

      const updatePayload = {};

      // ===================== CASE 1: RESET ATTENDANCE =====================
      if (resetAttendance === true) {
        // sem remains SAME
        // academicYear ALWAYS increments by 1
        console.log(resetAttendance);
        
        const [startYear] = student.academicYear.split("-");
        const nextStart = parseInt(startYear, 10) + 1;
        console.log(nextStart);
        
        updatePayload.academicYear = `${nextStart}-${(nextStart + 1)
          .toString()
          .slice(-2)}`;

        // semId unchanged

        rolledBack.push({
          studentId: student._id,
          sem: student.semId,
          academicYearFrom: student.academicYear,
          academicYearTo: updatePayload.academicYear,
          type: "RESET_YEAR_ONLY"
        });
      }

      // ===================== CASE 2: NORMAL ROLLBACK =====================
      else {
        if (currentSem <= 1) {
          skipped.push({
            studentId: student._id,
            reason: "Already in first semester"
          });
          continue;
        }

        const previousSem = (currentSem - 1).toString();
        updatePayload.semId = previousSem;

        // academicYear decreases ONLY if crossing year boundary (odd → even logic)
        // example: sem 3 → sem 2 (same academic year)
        // example: sem 2 → sem 1 (previous academic year)

        if (currentSem % 2 === 0) {
          const [startYear] = student.academicYear.split("-");
          const prevStart = parseInt(startYear, 10) - 1;

          updatePayload.academicYear = `${prevStart}-${(prevStart + 1)
            .toString()
            .slice(-2)}`;
        }

        rolledBack.push({
          studentId: student._id,
          fromSem: student.semId,
          toSem: previousSem,
          academicYearFrom: student.academicYear,
          academicYearTo: updatePayload.academicYear || student.academicYear,
          type: "NORMAL_ROLLBACK"
        });
      }

      await Student.updateOne(
        { _id: student._id },
        { $set: updatePayload },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Rollback completed successfully",
      summary: {
        requested: studentIds.length,
        rolledBack: rolledBack.length,
        skipped: skipped.length
      },
      rolledBack,
      skipped
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Rollback error:", error);
    return res.status(500).json({
      success: false,
      message: "Rollback failed",
      error: error.message
    });
  }
};


