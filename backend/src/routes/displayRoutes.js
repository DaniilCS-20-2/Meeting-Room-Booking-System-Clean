const express = require("express");
const displayController = require("../controllers/displayController");

const router = express.Router();

router.get("/today", displayController.getToday);

module.exports = router;
