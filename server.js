// server.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_NAME = 'gemini-1.5-flash-latest'; // Or your preferred model

if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined in your .env file.");
    process.exit(1);
}

app.post('/api/get-quote', async (req, res) => {
    // MODIFIED: Destructure topic AND language from request body
    const { topic, language } = req.body;

    if (!topic) {
        return res.status(400).json({ error: "Topic is required." });
    }
    if (!language || !['en', 'th'].includes(language)) { // Basic validation for language
        return res.status(400).json({ error: "Valid language ('en' or 'th') is required." });
    }

    const languageInstruction = language === 'th' ? "in Thai language" : "in English language";

    // MODIFIED: Prompt now includes language instruction
    const prompt = `
        A user is feeling or thinking about: "${topic}".
        Generate an extremely short, impactful phrase ${languageInstruction} (ideally 5-15 words in the target language).
        It should hit like a memorable movie line or a resonant song lyric.
        Make it easy to understand, potent, and highly quotable in the specified language.
        Offer a flash of insight, comfort, or a powerful perspective.
        No fluff, no explanation. Just the core line. Direct, clear, and strong.
        Think of something that sticks.
        DO NOT include any introductory phrases or your own quotation marks.
      `;

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const geminiResponse = await fetch(geminiApiUrl, { // Use the dynamically constructed URL
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
                    "maxOutputTokens": 80, // Adjusted slightly, as Thai might use more tokens for same meaning
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Gemini API Error:', errorData);
            return res.status(geminiResponse.status).json({ 
                error: "Failed to fetch quote from Gemini.", 
                details: errorData.error?.message || 'Unknown Gemini API error' 
            });
        }

        const data = await geminiResponse.json();

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            let generatedText = data.candidates[0].content.parts[0].text;
            generatedText = generatedText.replace(/\*/g, '').replace(/^["“„']+|["””']$/g, '').trim();
            
            // Word count logic might be less accurate for Thai, but keep as a rough guard
            const words = generatedText.split(/\s+|(?<=[\u0E00-\u0E7F])(?=[\u0E00-\u0E7F])|(?<=.)(?=[\u0E00-\u0E7F])|(?<=[\u0E00-\u0E7F])(?=.)/); // More complex split for Thai
            if (words.length > 25) { // Slightly more lenient for Thai
                generatedText = words.slice(0, 25).join('') + '...'; // Join directly for Thai
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
});
