import mongoose from "mongoose";

const userSchema = mongoose.Schema(
  {
    tgId: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    isBot: {
      type: Boolean,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    promptTokens: {
      type: Number,
      default: 0, // Default value
    },
    completionTokens: {
      type: Number,
      default: 0, // Default value
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
