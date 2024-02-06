const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    felhasznalonev: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    jelszo: {
      type: String,
      required: true,
    },
    rolam: {
      type: String,
      default: "Rólam...",
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    profilkep: {
      type: String,
    },
    profilkepNev: {
      type: String,
    },
    boritokep: {
      type: String,
    },
    boritokepNev: {
      type: String,
    },
    koveteseim: {
      type: Array,
    },
    kovetoim: {
      type: Array,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("user", userSchema);
