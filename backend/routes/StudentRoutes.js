const express = require("express");
const { getAllStudents, createStudent, getStudents, getStudentById, updateStudent, deleteStudent, promoteStudentsToNextSemester, rollbackStudents } = require("../controllers/StudentController");
const router = express.Router();


// CRUD
router.post("/create", createStudent);
router.get("/", getStudents);
router.get("/:id", getStudentById);
router.put("/update/:id", updateStudent);
router.delete("/delete/:id", deleteStudent);
router.post("/students/promote", promoteStudentsToNextSemester);
router.post(
    "/students/rollback-promotion",
    rollbackStudents
);




module.exports = router;
