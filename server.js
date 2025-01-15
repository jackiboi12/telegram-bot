import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import userModel from "./src/models/User.js";
import eventModel from "./src/models/Event.js";
import connectDb from "./src/config/db.js";
import OpenAI from "openai";
const bot = new Telegraf(process.env.BOT_TOKEN);

const openai = new OpenAI({
  apiKey: process.env["OPEN_AI"],
});

try {
  connectDb();
  console.log("DB CONNECTED SUCCESSFULLY");
} catch (error) {
  console.log(error);
  process.kill(process.pid, "SIGTERM");
}

bot.start(async (ctx) => {
  const from = ctx.update.message.from;
  try {
    await userModel.findOneAndUpdate(
      { tgId: from.id },
      {
        $setOnInsert: {
          firstName: from.first_name,
          lastName: from.last_name,
          isBot: from.is_bot,
          username: from.username,
        },
      },
      { upsert: true, new: true }
    );

    await ctx.reply(
      "👋\nWelcome to the bot. Here, you can generate engaging posts for social media and keep track of your events. Let's get started and see my MAGIC!!"
    );
  } catch (error) {
    console.log(error);
    await ctx.reply("Facing difficulties 1");
  }

  // console.log("Ctx->",from);
  // store the user info into DB
});

bot.command("generate", async (ctx) => {
  const from = ctx.update.message.from;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfTheDay = new Date();
  endOfTheDay.setHours(23, 59, 59, 999);
  // get events for the users(only daily tasks)
  const events = await eventModel.find({
    tgId: from.id,
    createdAt: {
      $gte: startOfDay,
      $lte: endOfTheDay,
    },
  });

  if (events.length == 0) {
    await ctx.reply("No Events for the day");
    return;
  }

  console.log("Events", events);

  // make openai api call
  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "ACT as senior copywriter , you write human written text which are highly engaging for Linkedin,Facebook and twitter using provided thoughts/texts throught the day.",
        },
        {
          role: "user",
          content: `Write like a human, for humans.Craft post for linkedin, Facebook and Twitter . Use Simple but attractvie words.Dont mention the time in the posts.Each post should be unique no repeatitive words allowed.Ensure the tone is formal and friendly.Focus on engaging the respective platform's audience,encouraging interaction,and driving interest in the events: ${events
            .map((event) => event.text)
            .join(", ")} `,
        },
      ],
      model: process.env.OPENAI_MODEL,
    });
    console.log("completion", chatCompletion);

    // store token count
    await userModel.findOneAndUpdate(
      {
        tgId: from.id,
      },
      {
        $inc: {
          promptTokens: chatCompletion.usage.prompt_tokens,
          completionTokens: chatCompletion.usage.completion_tokens,
        },
      }
    );

    await ctx.reply(chatCompletion.choices[0].message.content);
  } catch (err) {
    console.log("Facing error 3");
  }

  // store token count
  // send response
});

// reply of any text
bot.on(message("text"), async (ctx) => {
  const from = ctx.update.message.from;
  const message = ctx.update.message.text;

  try {
    await eventModel.create({
      text: message,
      tgId: from.id,
    });
    await ctx.reply(
      "Noted!! KEEP TEXTINGGGG !!,to generate POST enter the command: /generate"
    );
  } catch (error) {
    console.log(error);
    await ctx.reply("Facing difficulties 2");
  }
});

bot.launch();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));