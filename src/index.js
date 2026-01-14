import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());

// IMPORTANT: accept raw binary body
app.use(
    "/image",
    express.raw({
        type: "application/octet-stream",
        limit: "20mb",
    })
);

app.post("/image", async (req, res) => {
    try {
        const targetUrl = "http://127.0.0.1:80/image"; // downstream service

        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": req.body.length,
            },
            body: req.body, // forward binary data as-is
        });

        const responseBuffer = Buffer.from(await response.arrayBuffer());

        // Forward status & headers
        res.status(response.status);
        response.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });

        res.send(responseBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to forward image" });
    }
});

app.listen(PORT, () => {
    console.log(`Image proxy listening on http://localhost:${PORT}`);
});
