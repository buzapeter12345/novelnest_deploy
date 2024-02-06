const mongoose = require("mongoose");

const languageSchema = new mongoose.Schema(
  {
    nyelv: {
      type: String,
    },
  },
);

module.exports = mongoose.model("language", languageSchema);
