import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import userModel from "./src/models/User.js";
import connectDb from "./src/config/db.js";
import { message } from "telegraf/filters";
import eventModel from "./src/models/Event.js";
import OpenAI from "openai";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const openAi = new OpenAI({
  apiKey: process.env["OPEN_AI"],
});

// Connect to the database
try {
  await connectDb();
  console.log("✅ Database connected successfully!");
} catch (error) {
  console.error("❌ Error connecting to the database:", error);
  process.kill(process.pid, "SIGTERM");
}

// Throttle requests to prevent overuse of OpenAI API
let lastRequestTime = {};

// Bot start command
bot.start(async (ctx) => {
  const from = ctx.update.message.from;
  console.log("User started the bot:", from);

  try {
    // Save or update user in the database
    await userModel.findOneAndUpdate(
      { tgId: from.id },
      {
        $setOnInsert: {
          firstName: from.first_name,
          lastName: from.last_name || "N/A",
          isBot: from.is_bot,
          username: from.username || "N/A",
        },
      },
      { upsert: true, new: true }
    );

    // Welcome message
    await ctx.reply(
      `Hello ${from.first_name}! 👋\nWelcome to the bot. Here, you can generate engaging posts for social media and keep track of your events. Let's get started!`
    );
  } catch (err) {
    console.error("❌ Error in bot start:", err);
    await ctx.reply("Oops! Something went wrong while starting the bot. Please try again later.");
  }
});

// Generate command
bot.command("generate", async (ctx) => {
  const from = ctx.update.message.from;
  const userId = from.id;

  // Rate limiting: allow only one request every 10 seconds per user
  const now = Date.now();
  if (lastRequestTime[userId] && now - lastRequestTime[userId] < 10000) {
    return ctx.reply("⏳ Please wait a few seconds before trying again.");
  }
  lastRequestTime[userId] = now;

  // Notify user about processing
  const { message_id: waitingMessageId } = await ctx.reply(
    `✨ Hi ${from.first_name}, I'm crafting your social media posts. Please hold on for a moment...`
  );

  try {
    // Fetch events created today by the user
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfTheDay = new Date();
    endOfTheDay.setHours(23, 59, 59, 999);

    const events = await eventModel.find({
      tgId: from.id,
      createdAt: {
        $gte: startOfDay,
        $lte: endOfTheDay,
      },
    });

    if (events.length === 0) {
      await ctx.deleteMessage(waitingMessageId);
      return await ctx.reply("📅 No events found for today. Please add some events first!");
    }

    // Prepare data for OpenAI API
    const eventTexts = events.map((event) => event.text).join(", ");
    const chatCompletion = await openAi.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a senior copywriter specializing in crafting engaging social media content.",
        },
        {
          role: "user",
          content: `Generate creative LinkedIn, Facebook, and Twitter posts based on these events: ${eventTexts}`,
        },
      ],
      model: "gpt-3.5-turbo",
      max_tokens: 500,
    });

    // Respond with generated content
    await ctx.deleteMessage(waitingMessageId);
    await ctx.reply(chatCompletion.choices[0].message.content);

    // Update user token usage
    await userModel.findOneAndUpdate(
      { tgId: from.id },
      {
        $inc: {
          promptTokens: chatCompletion.usage.prompt_tokens,
          completionTokens: chatCompletion.usage.completion_tokens,
        },
      }
    );
  } catch (err) {
    // Handle OpenAI quota errors
    if (err.code === "insufficient_quota") {
      console.error("❌ OpenAI quota exceeded:", err.message);
      await ctx.reply(
        "🚫 Sorry, I've reached my usage limit for today. Please try again tomorrow!"
      );
    } else {
      console.error("❌ Error in /generate command:", err);
      await ctx.reply("⚠️ An unexpected error occurred. Please try again later.");
    }
  }
});

// Handle text messages
bot.on(message("text"), async (ctx) => {
  const from = ctx.update.message.from;
  const userMessage = ctx.update.message.text;

  try {
    // Save user message as an event
    const event = await eventModel.create({
      text: userMessage,
      tgId: from.id,
    });
    console.log("✅ Event created:", event);

    // Acknowledge receipt
    await ctx.reply("📝 Got it! Your event has been recorded.");
  } catch (err) {
    console.error("❌ Error creating event:", err);
    await ctx.reply("⚠️ Sorry, I couldn't save your event. Please try again later.");
  }
});

// Global error handler
bot.catch((err, ctx) => {
  console.error("❌ Bot encountered an error:", err);
  ctx.reply("⚠️ Oops! Something went wrong. Please try again later.");
});

// Launch the bot
bot.launch();
console.log("🤖 Bot is up and running!");

// Handle graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
