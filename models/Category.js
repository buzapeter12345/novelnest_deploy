const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    kategoria: {
      type: String,
    },
  },
);

module.exports = mongoose.model("category", categorySchema);
