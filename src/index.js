import express from "express";
import fetch from "node-fetch";
import FormData from "form-data";
import multer from "multer";
import { Readable } from "stream";
import cors from "cors";

const app = express();
const upload = multer();

app.use(cors());

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
  upload.any(), // <-- accept any field name
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        throw new Error("No file received");
      }

      const file = req.files[0]; // first uploaded file

      const form = new FormData();
      form.append(
        "imageData", // what Ollama expects
        file.buffer,
        {
          filename: file.originalname || "image.jpg",
          contentType: file.mimetype || "image/jpeg",
          knownLength: file.size
        }
      );

      await forward(form, res);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }
);

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

app.listen(3000, () =>
  console.log("Proxy listening on http://localhost:3000")
);
