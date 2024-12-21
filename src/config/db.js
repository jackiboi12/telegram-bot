import mongoose from "mongoose";

export default async () => {
  try {
    await mongoose.connect(process.env.MONGO_CONNECTION_STRING, {
    });
    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    // Retry logic (optional)
    setTimeout(() => {
      process.exit(1); // Exit the process after logging the error
    }, 5000);
  }
};
