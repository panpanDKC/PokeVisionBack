import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";
import multer from "multer";
import cors from "cors";

/* =========================
   LangChain / Ollama imports
========================= */

import { Ollama } from "@langchain/community/llms/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";

/* =========================
   App setup
========================= */

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

/* =========================
   IMAGE PROXY (UNCHANGED)
========================= */

// RAW handler (octet-stream)
app.post(
  "/image",
  express.raw({ type: "application/octet-stream", limit: "20mb" }),
  async (req, res, next) => {
    if (req.is("application/octet-stream")) {
      return handleOctetStream(req, res);
    }
    next();
  }
);

// MULTIPART handler (browser / Postman)
app.post(
  "/image",
  upload.any(),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        throw new Error("No file received");
      }

      const file = req.files[0];

      const form = new FormData();
      form.append("imageData", file.buffer, {
        filename: file.originalname || "image.jpg",
        contentType: file.mimetype || "image/jpeg",
        knownLength: file.size
      });

      await forward(form, res);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }
);

async function handleOctetStream(req, res) {
  const form = new FormData();
  form.append("imageData", req.body, {
    filename: "image.bin",
    contentType: "application/octet-stream"
  });

  await forward(form, res);
}

async function forward(form, res) {
  const response = await fetch("http://localhost:80/image", {
    method: "POST",
    body: form,
    headers: form.getHeaders()
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  res.status(response.status);
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(buffer);
}

/* =========================
   LLM & Prompt
========================= */

const llm = new Ollama({
  model: "phi3.5",
  temperature: 0.2
});

const SYSTEM_PROMPT = `
You are an AI assistant specialized in Pokémon battle strategy, but you MUST base everything you say ONLY on the tabular data 
provided in the Context and the ALL_POKEMON list. You are NOT allowed to use any outside knowledge about Pokémon, even if you 
think you know it. Treat your own built-in Pokémon knowledge as unreliable. 
DATA FORMAT The Pokémon CSV has columns: "#", "Name", "Type 1", "Type 2", "Total", "HP","Attack", "Defense", "Sp. Atk", "Sp. Def", "Speed", "Generation", "Legendary". 
The type chart CSV has an "Attacking" column and one column per defensive type(Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel, Fairy) with numeric multipliers. ALL_POKEMON The ALL_POKEMON section contains the full list of valid Pokémon names. 
You may ONLY mention Pokémon whose names appear EXACTLY in that list. If you cannot find a Pokémon in ALL_POKEMON or in the Context, you MUST say:"I don't have enough data in the context to answer." TYPE / STATS RULES When you need a Pokémon's types or stats, read them from its row in the Context. Do NOT guess or infer types or stats that are not shown.
The type chart gives damage multipliers: lower numbers (like 0, 0.25, 0.5) mean the defender resists that attacking type; higher numbers (like 2, 4) mean weakness.
When judging a matchup, consider: Offensive potential: high Attack or Sp. Atk. Speed: who is likely to move first (higher "Speed"). Defensive bulk: high HP and relevant Defense/Sp. Def. BATTLE ADVICE BEHAVIOR If the user asks "What should I bring against X?" or similar: Find Pokémon X in the Context. If not found, say you don't have enough data.
Use its types and offensive stats to guess what kind of attacks it uses. Choose 2–3 Pokémon from ALL_POKEMON that: Are present in the Context, Take low damage (small multipliers) from X's likely attacking types, AND Either outspeed it (higher Speed) or are bulky on the relevant defensive side.
Answer with: 2–3 Pokémon names, and A very short reason for each (e.g. "resists Fire and Flying, high Sp. Def"). If the user asks "Is A good against B?": Answer "Yes" or "No" first, then 1 short sentence based only on types/stats in the Context. If the user asks for stats/info about a Pokémon: Return only the fields that actually appear in the Context. STRICT CONSTRAINTS NEVER invent new Pokémon names. NEVER change a Pokémon's type or stats from what the Context says.
NEVER mention specific moves unless they appear explicitly in the Context(your current data does not include moves, so you will normally talk in general terms like "can hit super effectively with Rock-type attacks"). If the Context does not give you enough information to answer safely, say: "I don't have enough data in the context to answer." STYLE Be concise: 1–3 sentences total.
`

const qaPrompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_PROMPT],
  ["human", "{input}"]
]);

/* =========================
   CHAT ENDPOINT (NO RAG)
========================= */

app.post("/chat", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    const prompt = await qaPrompt.format({
      input: question
    });

    const answer = await llm.invoke(prompt);

    res.json({ answer });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

/* =========================
   START SERVER
========================= */

const PORT = 3000;

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
