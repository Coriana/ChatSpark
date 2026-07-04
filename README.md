# ChatSpark

**ChatSpark** is your personal AI chat companion that works with any OpenAI-compatible backend. It's a fully self-contained browser app — no build step, no server, no accounts — designed to make conversations with AI feel natural and enjoyable.

## What makes ChatSpark special?

ChatSpark was built with the belief that talking to AI should be simple and pleasant. Whether you're using it for creative writing, problem-solving, or just casual conversation, ChatSpark gives you:

- A distraction-free interface that feels like texting a friend
- Streaming responses with a Stop button — no more staring at a spinner
- Dark mode that's easy on your eyes during late-night sessions
- Complete privacy with all data stored locally on your device

## Features

- **Connections & Models**: Add any OpenAI-compatible endpoint, fetch its model list automatically, and manage everything from a tabbed settings panel. Provider presets fill in the details for OpenAI, Anthropic, OpenRouter, Groq, Mistral, Hugging Face, Azure OpenAI, Ollama, LM Studio, and llama.cpp — with links to where each API key lives
- **Key encryption**: Optionally encrypt your API keys at rest with a passphrase (AES-GCM + PBKDF2); you're asked for it once per session and decrypted keys never touch disk
- **Switch models mid-conversation**: A model picker lives right in the header; every response is tagged with the model that wrote it
- **Streaming responses**: Replies render token-by-token with proper Markdown — headings, lists, tables, and syntax-highlighted code blocks with copy buttons
- **Image support**: Attach, paste, or drag & drop images into the chat (sent using the OpenAI vision format; large images are downscaled automatically)
- **System prompts**: Set a global default, give a folder its own default (folders act like projects), and override either per conversation
- **Edit & regenerate**: Edit any of your messages and resend, or regenerate any assistant response in place — with a different model if you like
- **Conversation management**: Auto-generated titles, folders, full-text search across titles and message content, undo for deleted messages and conversations, and per-chat export to Markdown or JSON
- **Backup & restore**: Export all data to a single JSON file and import it on another machine
- **Roomy storage**: Conversations (including images) live in IndexedDB, not the cramped 5 MB localStorage — existing chats are migrated automatically

## Quick Start

1. **Get it running:**
   ```bash
   git clone https://github.com/yourusername/ChatSpark.git
   cd ChatSpark
   ```
   Then simply open `index.html` in your browser (or serve the folder with any static file server).

2. **Connect to your AI:**
   - The settings panel opens automatically on first run (or click ⚙️)
   - Add a connection: pick a provider preset (or Custom), paste your key if the server needs one
   - Click **Fetch Models** to pull the model list (or add model ids manually), then **Save**
   - Optionally enable **key encryption** at the bottom of the Connections tab

3. **Start chatting:**
   - Pick a model from the dropdown in the header
   - Type your message and press Enter (Shift+Enter for a newline)
   - Attach images with 📎, by pasting, or by dropping them onto the chat

4. **Make it yours:**
   - Set a default system prompt, temperature, and max tokens in Settings → Chat
   - Override the system prompt for any single chat with the 📝 button
   - Organize conversations into folders and find them again with search

## Behind the Scenes

ChatSpark is built with vanilla web technologies:

- **HTML/CSS/JavaScript** — no framework, no build step
- **IndexedDB** for conversations and images, **localStorage** for settings
- Vendored [marked](https://github.com/markedjs/marked), [DOMPurify](https://github.com/cure53/DOMPurify), and [highlight.js](https://github.com/highlightjs/highlight.js) for safe, pretty Markdown rendering — still fully offline

API keys are only ever sent to the endpoints you configure, and all conversation data stays on your device. By default keys sit unencrypted in local storage; turn on passphrase encryption in Settings → Connections to store them as AES-GCM ciphertext instead.

## Making ChatSpark Your Own

- Edit `style.css` to transform the visual experience
- Modify `script.js` to change behaviors or add new features
- All your changes stay local — no data leaves your computer

## Join the Community

Found a bug? Have an idea for an improvement? Want to contribute code?

- Open an issue or submit a pull request on GitHub
- Share how you're using ChatSpark
- Let us know what features would make your experience better

## License

ChatSpark is available under the Apache License 2.0. Feel free to use, modify, and share it!

---

Made with ❤️ for better AI conversations
