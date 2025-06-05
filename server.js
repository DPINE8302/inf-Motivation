// server.js
import express from 'express';
import fetch from 'node-fetch'; // For making API calls from Node.js
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000; // Use environment port or 3000

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON request bodies
app.use(express.static('public')); // Serve static files from the 'public' directory

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined in your .env file.");
    process.exit(1); // Exit if API key is missing
}

// API endpoint for the frontend to call
app.post('/api/get-quote', async (req, res) => {
    const { topic } = req.body;

    if (!topic) {
        return res.status(400).json({ error: "Topic is required." });
    }

    const prompt = `
        A user is feeling or thinking about: "${topic}".
        Generate an extremely short, impactful phrase (ideally 5-15 words).
        It should hit like a memorable movie line or a resonant song lyric.
        Make it easy to understand, potent, and highly quotable.
        Offer a flash of insight, comfort, or a powerful perspective.
        No fluff, no explanation. Just the core line. Direct, clear, and strong.
        Think of something that sticks.
        DO NOT include any introductory phrases or your own quotation marks.
      `;

    try {
        const geminiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    "temperature": 0.85,
                    "maxOutputTokens": 60,
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Gemini API Error:', errorData);
            // Forward a generic error or specific details if safe
            return res.status(geminiResponse.status).json({ 
                error: "Failed to fetch quote from Gemini.", 
                details: errorData.error?.message || 'Unknown Gemini API error' 
            });
        }

        const data = await geminiResponse.json();

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            let generatedText = data.candidates[0].content.parts[0].text;
            generatedText = generatedText.replace(/\*/g, '').replace(/^["“„']+|["””']$/g, '').trim();
            
            const words = generatedText.split(' ');
            if (words.length > 20) {
                generatedText = words.slice(0, 20).join(' ') + '...';
            }

            if (generatedText) {
                res.json({ quote: generatedText });
            } else {
                res.status(500).json({ error: "Gemini returned an empty quote." });
            }
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
            console.warn("Gemini API Request blocked:", data.promptFeedback);
            res.status(400).json({ 
                error: `Request blocked by Gemini: ${data.promptFeedback.blockReason}`,
                details: `Categories: ${data.promptFeedback.safetyRatings?.map(r => r.category).join(', ')}`
            });
        }
        else {
            console.warn("No suitable candidate found in Gemini API response:", data);
            res.status(500).json({ error: "Could not generate a suitable quote." });
        }

    } catch (error) {
        console.error('Server Error fetching quote:', error);
        res.status(500).json({ error: "An internal server error occurred.", details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log("Serving frontend from 'public' directory.");
    console.log("Make sure your index.html is in the 'public' folder.");
});