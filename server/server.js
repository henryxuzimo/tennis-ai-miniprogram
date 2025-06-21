const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const readConfig = () => {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
};

app.post('/chat', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Received /chat request`);
    const { query, user, chat_history } = req.body;
    const { bot_id, token } = readConfig();

    try {
        const response = await axios({
            method: 'POST',
            url: 'https://api.coze.cn/open_api/v2/chat',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            data: {
                bot_id,
                user,
                query,
                chat_history: chat_history || [],
                stream: true,
            },
            responseType: 'stream', // This is crucial for axios to handle the response as a stream
        });

        console.log(`[${new Date().toISOString()}] Coze API responded with status: ${response.status}`);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        response.data.pipe(res);

        response.data.on('error', (err) => {
            console.error('[ERROR] Stream pipe error:', err);
            res.end();
        });

    } catch (error) {
        if (error.response) {
            console.error(`[FATAL] Coze API Error: ${error.response.status}`, error.response.data);
            res.status(502).send(error.response.data);
        } else {
            console.error('[FATAL] Internal Server Error:', error.message);
            res.status(500).send('Internal Server Error');
        }
    }
});

// --- Admin Panel ---
// Serve the admin HTML page
app.get('/admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Coze API Config</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f4f9; color: #333; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background: #fff; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 500px; }
                h1 { color: #5a67d8; }
                label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
                input { width: 100%; padding: 0.8rem; margin-bottom: 1rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                button { width: 100%; padding: 0.8rem; background-color: #5a67d8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
                button:hover { background-color: #434190; }
                .message { margin-top: 1rem; padding: 0.8rem; border-radius: 4px; }
                .success { background-color: #e6fffa; color: #38a169; }
                .error { background-color: #fed7d7; color: #c53030; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Coze API Configuration</h1>
                <form action="/update-config" method="POST">
                    <label for="bot_id">Bot ID:</label>
                    <input type="text" id="bot_id" name="bot_id" required>
                    <label for="token">Personal Access Token:</label>
                    <input type="password" id="token" name="token" required>
                    <button type="submit">Save Configuration</button>
                </form>
                <div id="message" class="message"></div>
            </div>
            <script>
                const form = document.querySelector('form');
                const messageDiv = document.getElementById('message');
                const urlParams = new URLSearchParams(window.location.search);

                if (urlParams.has('success')) {
                    messageDiv.textContent = 'Configuration saved successfully!';
                    messageDiv.className = 'message success';
                }
                
                fetch('/get-config')
                    .then(res => res.json())
                    .then(data => {
                        document.getElementById('bot_id').value = data.bot_id;
                        document.getElementById('token').value = data.token;
                    });
            </script>
        </body>
        </html>
    `);
});

// Endpoint to get current config for the admin form
app.get('/get-config', (req, res) => {
    res.json(readConfig());
});


// Endpoint to update the config
app.post('/update-config', (req, res) => {
    const { bot_id, token } = req.body;
    if (!bot_id || !token) {
        return res.status(400).send('Bot ID and Token are required.');
    }
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ bot_id, token }, null, 2), 'utf-8');
        res.redirect('/admin?success=true');
    } catch (error) {
        console.error('Error writing config file:', error);
        res.status(500).send('Failed to save configuration.');
    }
});


app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log(`🔑 Admin panel is available at http://localhost:${PORT}/admin`);
}); 